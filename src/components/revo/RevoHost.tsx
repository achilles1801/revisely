import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '../../context/AppContext';
import { auth } from '../../lib/firebase';
import { logger } from '../../lib/logger';
import { navigationRef } from '../../navigation/navigationRef';
import { useTabBarHeight } from '../../navigation/TabBar';
import { MINI_PLAYER_GAP, MINI_PLAYER_HEIGHT } from '../player/MiniPlayer';
import { useMiniPlayer } from '../../lib/nowPlaying';
import { refreshRevoRelease } from '../../lib/revo/release';
import { REVO_BUTTON_ROUTES, useRevoAvailable } from '../../lib/revo/availability';
import { revoBackend } from '../../lib/revo/backend';
import { dayHadActivity } from '../../lib/revo/context';
import { greetingState, nextOpens, type GreetingOpens } from '../../lib/revo/greeting';
import { onRevoOpen, type RevoOpenRequest } from '../../lib/revo/open';
import { openScreen } from '../../lib/revo/screens';
import { setRevoButtonRoute, setRevoPresent } from '../../lib/revo/presence';
import type { RevoAction, RevoAttachment, RevoSettings } from '../../lib/revo/types';
import { useRevoContext } from '../../lib/revo/useRevoContext';
import { RevoBoundary } from './RevoBoundary';
import { REVO_BUTTON_GAP, RevoButton } from './RevoButton';
import { RevoChat } from './RevoChat';
import { RevoHistory, RevoMemory, RevoOptIn } from './RevoPages';
import { RevoAddSheet } from './RevoAddSheet';
import { RevoSheetFrame } from './RevoSheetFrame';

type View_ = { name: 'chat' } | { name: 'history' } | { name: 'memory' } | { name: 'optin' } | { name: 'add' };

/** A tap before the account's switch is read waits for it this long, then opens with what is known. */
export const SETTINGS_WAIT_MS = 2000;

/** From this hour (local) the day's review is written, once, if the day had activity. */
export const REVIEW_FROM_HOUR = 19;
const reviewAskedKey = (uid: string, day: string) => `@revo_review_asked:${uid}:${day}`;
const reviewSeenKey = (uid: string) => `@revo_review_seen:${uid}`;
/** How many times today's greeting has opened, and in which state (lib/revo/greeting nextOpens). */
const greetingOpensKey = (uid: string) => `@revo_greeting_opens:${uid}`;

/** The focused route's name, following navigation. */
function useRouteName(): string | null {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    const read = () => setName(navigationRef.isReady() ? (navigationRef.getCurrentRoute()?.name ?? null) : null);
    read();
    const unsub = navigationRef.addListener('state', read);
    const id = setInterval(() => {
      if (navigationRef.isReady()) {
        read();
        clearInterval(id);
      }
    }, 300);
    return () => {
      unsub();
      clearInterval(id);
    };
  }, []);
  return name;
}

function useKeyboardUp(): boolean {
  const [up, setUp] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setUp(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setUp(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return up;
}

/**
 * Revo in the app (the accounts its release opens it to: config/app.revo, REVO-37): its button on
 * the main screens and its sheet. The first tap opens the opt-in; after that, every open is a new
 * conversation on a greeting written then (REVO-34). An earlier one shows only when picked: in History, or today's Day in review from
 * its row under the greeting, which the button's dot points to until it is opened. Each evening
 * with something done, the day's review is written once (it never counts toward the day's questions).
 */
export function RevoHost() {
  const { user } = useApp();
  const available = useRevoAvailable(user);
  // An open sheet stays until it is closed, even when Revo is paused meanwhile (REVO-37): it says why,
  // and only the button goes at once.
  const [sheetOpen, setSheetOpen] = useState(false);
  if (!user || (!available && !sheetOpen)) return null;
  return <RevoHostInner available={available} onOpenChange={setSheetOpen} />;
}

function RevoHostInner({ available, onOpenChange }: { available: boolean; onOpenChange: (open: boolean) => void }) {
  const uid = auth.currentUser?.uid ?? '';
  useEffect(() => {
    setRevoPresent(true);
    return () => setRevoPresent(false);
  }, []);
  const backend = revoBackend();
  const route = useRouteName();
  const keyboard = useKeyboardUp();
  const tabBar = useTabBarHeight();
  const { visible: miniPlayer } = useMiniPlayer();
  const { day, build } = useRevoContext();

  const [settings, setSettings] = useState<RevoSettings | null>(null);
  const [usage, setUsage] = useState({ day: '', count: 0 });
  const [open, setOpen] = useState(false);
  const [full, setFull] = useState(false);
  const [view, setView] = useState<View_>({ name: 'chat' });
  const [chatId, setChatId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<RevoAttachment[]>([]);
  // The sheet's height before Add to chat took it to full height: back to it after (mock a7).
  const fullBeforeAdd = useRef(false);
  const [optInBusy, setOptInBusy] = useState(false);
  const [optInError, setOptInError] = useState<string | null>(null);

  useEffect(() => (uid ? backend.watchSettings(uid, setSettings) : undefined), [backend, uid]);
  useEffect(() => (uid ? backend.watchUsage(uid, setUsage) : undefined), [backend, uid]);

  // Today's review, and whether the user has opened it: when its first message was written, while
  // it hasn't been. The day it was last opened is state, so a later write to the review (a
  // follow-up asked in it) can't offer it again; before Nov 7 2026 a listener kept the day it had
  // read at its start and put the review back on the button after every change to it.
  const reviewId = `review-${day}`;
  const [reviewAt, setReviewAt] = useState<number | null>(null);
  const [seenDay, setSeenDay] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    setSeenDay(undefined);
    if (uid) {
      void AsyncStorage.getItem(reviewSeenKey(uid))
        .catch(() => null)
        .then((seen) => live && setSeenDay(seen));
    }
    return () => {
      live = false;
    };
  }, [uid]);
  useEffect(() => {
    setReviewAt(null);
    if (!uid || !settings?.optIn) return;
    return backend.watchMessages(uid, reviewId, (messages) => setReviewAt(messages[0]?.at ?? null));
  }, [backend, uid, settings?.optIn, reviewId]);
  const reviewWaiting = reviewAt != null && seenDay !== undefined && seenDay !== day;
  const markReviewSeen = useCallback(() => {
    setSeenDay(day);
    void AsyncStorage.setItem(reviewSeenKey(uid), day).catch(() => undefined);
  }, [uid, day]);
  // Each new conversation counts one open of today's greeting in the state the day is in, kept on
  // the phone so a restart doesn't say "done" again (REVO-35).
  const opens = useRef<GreetingOpens | null>(null);
  const [opening, setOpening] = useState<GreetingOpens | null>(null);
  useEffect(() => {
    let live = true;
    if (uid) {
      void AsyncStorage.getItem(greetingOpensKey(uid))
        .catch(() => null)
        .then((raw) => {
          if (!live || opens.current) return;
          try {
            const rec = raw ? (JSON.parse(raw) as GreetingOpens) : null;
            if (rec && typeof rec.day === 'string' && typeof rec.state === 'string' && Number.isInteger(rec.n)) opens.current = rec;
          } catch {
            // A record that can't be read starts again.
          }
        });
    }
    return () => {
      live = false;
    };
  }, [uid]);
  const countOpen = useCallback(() => {
    const ctx = build();
    if (!ctx) return setOpening(null);
    const rec = nextOpens(opens.current, day, greetingState(ctx));
    opens.current = rec;
    setOpening(rec);
    void AsyncStorage.setItem(greetingOpensKey(uid), JSON.stringify(rec)).catch(() => undefined);
  }, [build, day, uid]);
  // Revo turned off (here, in Settings or on another phone): turned on again, it starts afresh.
  useEffect(() => {
    if (!uid || settings == null || settings.optIn) return;
    opens.current = null;
    void AsyncStorage.removeItem(greetingOpensKey(uid)).catch(() => undefined);
  }, [uid, settings]);

  // Today's review as it was when this conversation opened: a review written while the sheet is up
  // waits for the next open (its dot) rather than appearing under the greeting being read.
  const [reviewOffer, setReviewOffer] = useState<number | null>(null);
  const reviewNow = useRef<number | null>(null);
  reviewNow.current = reviewWaiting ? reviewAt : null;

  /** A new conversation: the greeting, written now (REVO-34). */
  const startFresh = useCallback(() => {
    setView({ name: 'chat' });
    setChatId(null);
    setReviewOffer(reviewNow.current);
    countOpen();
  }, [countOpen]);

  // A conversation the user picked: its messages, at full height; today's review is then opened.
  const openChat = useCallback(
    (id: string) => {
      setChatId(id);
      setView({ name: 'chat' });
      setFull(true);
      if (id === reviewId) {
        markReviewSeen();
        setReviewOffer(null);
      }
    },
    [reviewId, markReviewSeen],
  );

  // In the evening, write today's review once (if the day had activity).
  const askedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!uid || !settings?.optIn) return;
    if (new Date().getHours() < REVIEW_FROM_HOUR || askedRef.current === day) return;
    askedRef.current = day;
    void (async () => {
      const key = reviewAskedKey(uid, day);
      if ((await AsyncStorage.getItem(key).catch(() => null)) != null) return;
      const ctx = build();
      if (!ctx || !dayHadActivity(ctx)) return;
      await AsyncStorage.setItem(key, '1').catch(() => undefined);
      await backend.dayInReview({ day, context: ctx }).catch((err) => logger.warn('Revo: no day in review', { refusal: err?.refusal }));
    })();
  }, [backend, uid, settings?.optIn, day, build, route]);

  // A tap before the switch is read (just after launch) waits for it, so the sheet opens on the
  // opt-in or on the chat, never the opt-in for an account that has Revo on.
  const waiting = useRef<{ request: RevoOpenRequest; timer: ReturnType<typeof setTimeout> } | null>(null);
  const show = useCallback(
    (request: RevoOpenRequest = {}, known = settings != null) => {
      if (!known) {
        if (waiting.current) clearTimeout(waiting.current.timer);
        const timer = setTimeout(() => {
          const w = waiting.current;
          waiting.current = null;
          if (w) showRef.current(w.request, true);
        }, SETTINGS_WAIT_MS);
        waiting.current = { request, timer };
        return;
      }
      setOptInError(null);
      if (!settings?.optIn) {
        setView({ name: 'optin' });
        setFull(true);
      } else if (request.view === 'memory') {
        setView({ name: 'memory' });
        setFull(true);
      } else if (request.chatId) {
        openChat(request.chatId);
      } else {
        // A new conversation, its greeting written now (REVO-34), whatever was open before.
        startFresh();
        setFull(false);
        if (request.attach) setAttachments([request.attach]);
      }
      setOpen(true);
    },
    [settings, openChat, startFresh],
  );
  const showRef = useRef(show);
  showRef.current = show;
  useEffect(() => onRevoOpen(show), [show]);
  useEffect(() => {
    const w = waiting.current;
    if (!settings || !w) return;
    clearTimeout(w.timer);
    waiting.current = null;
    show(w.request);
  }, [settings, show]);
  useEffect(() => () => waiting.current?.timer && clearTimeout(waiting.current.timer), []);

  const close = () => {
    setOpen(false);
    Keyboard.dismiss();
  };
  useEffect(() => onOpenChange(open), [open, onOpenChange]);

  const turnOn = async () => {
    setOptInBusy(true);
    setOptInError(null);
    try {
      // The server's answer is the switch now: the account's settings follow a moment later, and a
      // sheet closed and opened again before they do must open the chat, not the opt-in again.
      setSettings(await backend.setOptions({ optIn: true }));
      startFresh();
      setFull(false);
    } catch (err) {
      setOptInError((err as Error)?.message ?? 'Revo isn’t available on this account.');
      // Paused, or not open to this account (REVO-37): the switch is read again, so the button goes.
      if ((err as { refusal?: string })?.refusal === 'paused') void refreshRevoRelease(true);
    } finally {
      setOptInBusy(false);
    }
  };

  const doAction = (action: RevoAction) => {
    close();
    if (!navigationRef.isReady()) return;
    if (action.kind === 'openPage') {
      navigationRef.navigate('Read', { screen: 'QuranReader', params: { pageNumber: action.page } });
    } else if (action.kind === 'startRevision') {
      navigationRef.navigate('Home', { screen: 'ActiveRevision', params: undefined, initial: false });
    } else if (action.kind === 'openScreen') {
      openScreen((name, params) => (navigationRef.navigate as (n: string, p: object) => void)(name, params), action);
    }
  };

  const buttonRoute = route != null && REVO_BUTTON_ROUTES.has(route);
  useEffect(() => {
    setRevoButtonRoute(buttonRoute);
    return () => setRevoButtonRoute(false);
  }, [buttonRoute]);
  const buttonShown = available && buttonRoute && !open && !keyboard;
  const bottom = tabBar + (miniPlayer ? MINI_PLAYER_HEIGHT + MINI_PLAYER_GAP : 0) + REVO_BUTTON_GAP;

  return (
    <>
      {buttonShown ? <RevoButton bottom={bottom} dot={reviewWaiting} onPress={() => show()} /> : null}
      <RevoSheetFrame visible={open} onClose={close} full={full} onFullChange={setFull}>
        <RevoBoundary resetKey={open}>
          {view.name === 'optin' ? (
            <RevoOptIn onTurnOn={() => void turnOn()} onNotNow={close} busy={optInBusy} error={optInError} />
          ) : view.name === 'history' ? (
            <RevoHistory
              uid={uid}
              onBack={() => setView({ name: 'chat' })}
              onOpen={openChat}
              onNew={startFresh}
            />
          ) : view.name === 'memory' && settings ? (
            <RevoMemory uid={uid} settings={settings} today={day} onBack={() => setView({ name: 'chat' })} />
          ) : view.name === 'add' ? (
            <RevoAddSheet
              initial={attachments}
              onCancel={() => {
                setView({ name: 'chat' });
                setFull(fullBeforeAdd.current);
              }}
              onAdd={(list) => {
                setAttachments(list);
                setView({ name: 'chat' });
                setFull(fullBeforeAdd.current);
              }}
            />
          ) : (
            <RevoChat
              uid={uid}
              chatId={chatId}
              onChatId={setChatId}
              usage={usage}
              attachments={attachments}
              onAttachments={setAttachments}
              onAdd={() => {
                fullBeforeAdd.current = full;
                setView({ name: 'add' });
                setFull(true);
              }}
              onHistory={() => {
                setView({ name: 'history' });
                setFull(true);
              }}
              onMemory={() => {
                setView({ name: 'memory' });
                setFull(true);
              }}
              onExpand={() => setFull(true)}
              onAction={doAction}
              onOpenDay={(date) => {
                close();
                if (navigationRef.isReady()) navigationRef.navigate('Home', { screen: 'ActivityDay', params: { date }, initial: false });
              }}
              onOff={() => {
                setView({ name: 'optin' });
                setFull(true);
              }}
              review={reviewWaiting && reviewOffer != null ? { at: reviewOffer } : null}
              opening={opening}
              onOpenReview={() => openChat(reviewId)}
            />
          )}
        </RevoBoundary>
      </RevoSheetFrame>
    </>
  );
}
