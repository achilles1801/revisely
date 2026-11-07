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
import { REVO_BUTTON_ROUTES, revoAvailable } from '../../lib/revo/availability';
import { revoBackend } from '../../lib/revo/backend';
import { dayHadActivity } from '../../lib/revo/context';
import { onRevoOpen, type RevoOpenRequest } from '../../lib/revo/open';
import { setRevoButtonRoute, setRevoPresent } from '../../lib/revo/presence';
import type { RevoAction, RevoAttachment, RevoSettings } from '../../lib/revo/types';
import { useRevoContext } from '../../lib/revo/useRevoContext';
import { RevoBoundary } from './RevoBoundary';
import { REVO_BUTTON_GAP, RevoButton } from './RevoButton';
import { RevoChat } from './RevoChat';
import type { PickKind } from './RevoComposer';
import { RevoHistory, RevoMemory, RevoOptIn } from './RevoPages';
import { RevoPicker } from './RevoPicker';
import { RevoSheetFrame } from './RevoSheetFrame';

type View_ = { name: 'chat' } | { name: 'history' } | { name: 'memory' } | { name: 'optin' } | { name: 'pick'; kind: PickKind };

/** A tap before the account's switch is read waits for it this long, then opens with what is known. */
export const SETTINGS_WAIT_MS = 2000;

/** From this hour (local) the day's review is written, once, if the day had activity. */
export const REVIEW_FROM_HOUR = 19;
const reviewAskedKey = (uid: string, day: string) => `@revo_review_asked:${uid}:${day}`;
const reviewSeenKey = (uid: string) => `@revo_review_seen:${uid}`;

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
 * Revo in the app (previewTester accounts): its button on the main screens and its sheet. The
 * first tap opens the opt-in; after that, a conversation (a new one, or the Day in review that
 * the button's dot points to). Each evening with something done, the day's review is written
 * once (it never counts toward the day's questions).
 */
export function RevoHost() {
  const { user } = useApp();
  const available = revoAvailable(user);
  if (!available || !user) return null;
  return <RevoHostInner />;
}

function RevoHostInner() {
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
  const [attach, setAttach] = useState<RevoAttachment | null>(null);
  const [optInBusy, setOptInBusy] = useState(false);
  const [optInError, setOptInError] = useState<string | null>(null);
  const [reviewWaiting, setReviewWaiting] = useState<string | null>(null);

  useEffect(() => (uid ? backend.watchSettings(uid, setSettings) : undefined), [backend, uid]);
  useEffect(() => (uid ? backend.watchUsage(uid, setUsage) : undefined), [backend, uid]);

  // Today's review: is there one the user hasn't opened?
  const checkReview = useCallback(async () => {
    if (!uid || !settings?.optIn) return setReviewWaiting(null);
    const seen = await AsyncStorage.getItem(reviewSeenKey(uid)).catch(() => null);
    const id = `review-${day}`;
    const unsub = backend.watchMessages(uid, id, (messages) => {
      setReviewWaiting(messages.length > 0 && seen !== day ? id : null);
    });
    return unsub;
  }, [backend, uid, settings?.optIn, day]);
  useEffect(() => {
    let unsub: (() => void) | void;
    void checkReview().then((u) => {
      unsub = u;
    });
    return () => unsub?.();
  }, [checkReview]);

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
      } else {
        setView({ name: 'chat' });
        const target = request.chatId ?? (request.attach ? null : reviewWaiting);
        setChatId(target ?? null);
        setFull(target != null);
        if (request.attach) setAttach(request.attach);
        if (target && target === reviewWaiting) {
          void AsyncStorage.setItem(reviewSeenKey(uid), day).catch(() => undefined);
          setReviewWaiting(null);
        }
      }
      setOpen(true);
    },
    [settings, reviewWaiting, uid, day],
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

  const turnOn = async () => {
    setOptInBusy(true);
    setOptInError(null);
    try {
      await backend.setOptions({ optIn: true });
      setView({ name: 'chat' });
      setChatId(null);
      setFull(false);
    } catch (err) {
      setOptInError((err as Error)?.message ?? 'Revo isn’t available on this account.');
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
    }
  };

  const buttonRoute = route != null && REVO_BUTTON_ROUTES.has(route);
  useEffect(() => {
    setRevoButtonRoute(buttonRoute);
    return () => setRevoButtonRoute(false);
  }, [buttonRoute]);
  const buttonShown = buttonRoute && !open && !keyboard;
  const bottom = tabBar + (miniPlayer ? MINI_PLAYER_HEIGHT + MINI_PLAYER_GAP : 0) + REVO_BUTTON_GAP;

  return (
    <>
      {buttonShown ? <RevoButton bottom={bottom} dot={reviewWaiting != null} onPress={() => show()} /> : null}
      <RevoSheetFrame visible={open} onClose={close} full={full} onFullChange={setFull}>
        <RevoBoundary resetKey={open}>
          {view.name === 'optin' ? (
            <RevoOptIn onTurnOn={() => void turnOn()} onNotNow={close} busy={optInBusy} error={optInError} />
          ) : view.name === 'history' ? (
            <RevoHistory
              uid={uid}
              onBack={() => setView({ name: 'chat' })}
              onOpen={(id) => {
                setChatId(id);
                setView({ name: 'chat' });
                setFull(true);
              }}
              onNew={() => {
                setChatId(null);
                setView({ name: 'chat' });
              }}
            />
          ) : view.name === 'memory' && settings ? (
            <RevoMemory uid={uid} settings={settings} today={day} onBack={() => setView({ name: 'chat' })} />
          ) : view.name === 'pick' ? (
            <RevoPicker
              kind={view.kind}
              onBack={() => setView({ name: 'chat' })}
              onPick={(a) => {
                setAttach(a);
                setView({ name: 'chat' });
              }}
            />
          ) : (
            <RevoChat
              uid={uid}
              chatId={chatId}
              onChatId={setChatId}
              usage={usage}
              attach={attach}
              onAttach={setAttach}
              onPick={(kind) => {
                setView({ name: 'pick', kind });
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
            />
          )}
        </RevoBoundary>
      </RevoSheetFrame>
    </>
  );
}
