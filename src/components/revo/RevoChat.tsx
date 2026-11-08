import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { useHaptics } from '../../design/haptics';
import { copyText } from '../../lib/clipboard';
import { shiftDay } from '../../lib/journal';
import { logger } from '../../lib/logger';
import { revoBackAt } from '../../lib/revo/availability';
import { REVO_MESSAGES, RevoError, revoBackend } from '../../lib/revo/backend';
import { greetingState, revoChips, revoGreeting, type GreetingOpens } from '../../lib/revo/greeting';
import { useRevoContext } from '../../lib/revo/useRevoContext';
import { REVO_DAILY_QUESTIONS, type RevoAction, type RevoAttachment, type RevoMessage, type RevoRefusal } from '../../lib/revo/types';
import { atListEnd } from '../../lib/revo/sheetFit';
import { carryForTomorrow } from '../../lib/weakSpotActions';
import { greetingName } from '../../lib/displayName';
import { auth } from '../../lib/firebase';
import { ChartCard, PlanCard } from './RevoCards';
import { knownAction } from '../../lib/revo/screens';
import { RevoComposer } from './RevoComposer';
import { Chips, FeedbackRow, LimitCard, ReviewRow, RevoHeader, RevoText, Typing, UserBubble } from './RevoParts';

/**
 * A conversation with Revo. A new one opens on a line written from today's data as it is now (no
 * call; REVO-34), copy and thumbs, today's Day in review as a row until it is opened, suggestions,
 * and the composer. A question shows at once with Revo thinking;
 * the answer comes with at most one small chart and one suggested action, which waits for a
 * tap. When the day's questions are used, the composer greys out and says when Revo is back.
 */
export function RevoChat({
  uid,
  chatId,
  onChatId,
  usage,
  attachments,
  onAttachments,
  onAdd,
  onHistory,
  onMemory,
  onExpand,
  onAction,
  onOpenDay,
  onOff,
  review = null,
  onOpenReview,
  opening = null,
}: {
  uid: string;
  chatId: string | null;
  onChatId: (id: string) => void;
  usage: { day: string; count: number };
  /** What + attached to the next question (several at most REVO_MAX_ATTACHMENTS). */
  attachments: RevoAttachment[];
  onAttachments: (list: RevoAttachment[]) => void;
  /** Opens Add to chat. */
  onAdd: () => void;
  onHistory: () => void;
  onMemory: () => void;
  onExpand: () => void;
  /** Open a page or today's session (the sheet closes first). */
  onAction: (action: RevoAction) => void;
  /** A chart's day, in Activity (the sheet closes first). */
  onOpenDay?: (day: string) => void;
  /** The server says Revo is off for this account: show the opt-in (with what was asked kept for after). */
  onOff?: () => void;
  /** Today's Day in review, not opened yet: when it was written. A new conversation offers it under the greeting. */
  review?: { at: number } | null;
  onOpenReview?: () => void;
  /** This open of a new conversation, counted on the phone (RevoHost): a second open with nothing changed says something else (REVO-35). */
  opening?: GreetingOpens | null;
}) {
  const { palette } = useTheme();
  const haptics = useHaptics();
  const { user, saveUser } = useApp();
  const { day, context, extras, build, sources } = useRevoContext();
  const backend = revoBackend();
  const [messages, setMessages] = useState<RevoMessage[]>([]);
  // A question sent and not answered yet (shown with Revo thinking).
  const [pending, setPending] = useState<{ text: string; attached: { kind: string; label: string }[] } | null>(null);
  const [refusal, setRefusal] = useState<{ kind: RevoRefusal; message: string; retry?: string } | null>(null);
  const scroll = useRef<ScrollView>(null);
  // Whether the list shows its end. A list that gets shorter (the keyboard coming up, the sheet
  // fitting above it) keeps its end in view, as one that grows does: its plan card was left below
  // the list after an answer (flow 09 on Android, Nov 7 2026), as onContentSizeChange doesn't fire
  // for a change of the list's own height.
  const atEnd = useRef(true);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    atEnd.current = atListEnd(contentOffset.y, layoutMeasurement.height, contentSize.height);
  };

  // A chat just asked in: its question and answer, shown until its stored messages arrive.
  const seeded = useRef<{ chatId: string; messages: RevoMessage[] } | null>(null);
  useEffect(() => {
    const seed = seeded.current?.chatId === chatId ? seeded.current.messages : [];
    setMessages(seed);
    if (!chatId) return;
    return backend.watchMessages(uid, chatId, (stored) => setMessages(stored.length === 0 && seed.length > 0 ? seed : stored));
  }, [backend, uid, chatId]);

  const usedToday = usage.day === day ? usage.count : 0;
  const left = Math.max(0, REVO_DAILY_QUESTIONS - usedToday);
  const capped = refusal?.kind === 'monthly';
  const outOfQuestions = left === 0 || refusal?.kind === 'daily';
  const back = revoBackAt(user, new Date());
  const name = greetingName(user?.name, auth.currentUser?.displayName ?? null) || null;
  // How many times today's greeting opened in this state before (0 once anything changed).
  const open = context && opening && opening.day === day && opening.state === greetingState(context) ? opening.n : 0;
  const greeting = useMemo(() => (context ? revoGreeting(name, context, open, extras) : null), [context, name, open, extras]);
  const lastRevo = [...messages].reverse().find((m) => m.role === 'revo');
  const chips = chatId ? (lastRevo?.chips ?? []) : context ? revoChips(context, open, extras) : [];

  const ask = async (question: string) => {
    const ctx = build();
    if (!ctx) return;
    const sent = attachments;
    setRefusal(null);
    setPending({ text: question, attached: sent.map((a) => ({ kind: a.kind, label: a.label })) });
    onAttachments([]);
    onExpand();
    try {
      // One goes as `attach`, as every server takes it; several as `attachments` (from Nov 7 2026).
      const result = await backend.ask({
        chatId,
        day,
        question,
        context: ctx,
        attach: sent.length === 1 ? sent[0] : null,
        ...(sent.length > 1 ? { attachments: sent } : {}),
      });
      // Checked by the backend, and read here, never inside a state update: React throws an
      // updater's error again while rendering, outside this try (REACT-NATIVE-10).
      const { question: asked, reply } = result;
      if (!chatId || result.chatId !== chatId) {
        seeded.current = { chatId: result.chatId, messages: [asked, reply] };
        onChatId(result.chatId);
      } else {
        setMessages((list) => (list.some((m) => m.id === reply.id) ? list : [...list.filter((m) => m.id !== asked.id), asked, reply]));
      }
    } catch (err) {
      const e = err instanceof RevoError ? err : new RevoError('unavailable', REVO_MESSAGES.unavailable);
      logger.warn('Revo ask failed', { refusal: e.refusal });
      const retry = e.refusal === 'unavailable' || e.refusal === 'offline' ? question : undefined;
      setRefusal({ kind: e.refusal, message: e.message, retry });
      // Off on the server (turned off on another phone, or not on yet): the opt-in, not a dead end.
      if (e.refusal === 'off' && onOff) onOff();
      if (sent.length > 0) onAttachments(sent);
    } finally {
      setPending(null);
    }
  };

  // Once the stored question arrives, the pending one is gone (no flicker of both).
  useEffect(() => {
    scroll.current?.scrollToEnd({ animated: true });
  }, [messages.length, pending, refusal]);

  const copy = (text: string) => {
    copyText(text);
    haptics.light();
  };

  // A chart's "Revise first tomorrow": those pages lead tomorrow's revision, as a plan card's do.
  const reviseFirst = async (pages: number[]) => {
    if (!user) return;
    await saveUser({ ...user, carryOver: carryForTomorrow(shiftDay(day, 1), pages, user.carryOver) });
    haptics.success();
  };

  const act = async (m: RevoMessage) => {
    if (!m.action || !chatId) return;
    const a = m.action;
    if (a.kind === 'reviseFirst') {
      if (!user) return;
      try {
        await saveUser({ ...user, carryOver: carryForTomorrow(shiftDay(day, 1), a.pages, user.carryOver) });
        await backend.setActionState(uid, chatId, m.id, 'added');
        haptics.success();
      } catch (err) {
        logger.warn('Revo plan not added', err);
      }
      return;
    }
    await backend.setActionState(uid, chatId, m.id, 'added').catch(() => undefined);
    onAction(a);
  };

  return (
    <View style={styles.fill}>
      <View style={styles.gutter}>
        <RevoHeader onHistory={onHistory} onMemory={onMemory} />
      </View>
      <ScrollView
        ref={scroll}
        style={styles.fill}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        // The newest message in view once it has laid out: an answer's chart and plan card grow the
        // list after it arrives, and a scroll at arrival stopped above them (flow 09 on Android).
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
        onLayout={() => {
          if (atEnd.current) scroll.current?.scrollToEnd({ animated: false });
        }}
        onScroll={onScroll}
        scrollEventThrottle={64}
        testID="revo-messages"
      >
        {!chatId && greeting ? (
          <View style={styles.revo}>
            <RevoText text={greeting} greeting testID="revo-greeting" />
            <FeedbackRow onCopy={() => copy(greeting)} testID="revo-greeting" />
            {review && onOpenReview ? <ReviewRow at={review.at} onOpen={onOpenReview} /> : null}
          </View>
        ) : null}
        {messages.map((m) =>
          m.role === 'user' ? (
            <UserBubble key={m.id} text={m.text} attached={m.attachments ?? (m.attach ? [m.attach] : [])} testID="revo-question" />
          ) : (
            <View key={m.id} style={styles.revo} testID="revo-answer">
              <RevoText text={m.text} />
              {m.visual ?? m.chart ? (
                <ChartCard
                  chart={(m.visual ?? m.chart)!}
                  day={day}
                  sources={sources}
                  onOpenDay={onOpenDay}
                  onOpenPage={(page) => onAction({ kind: 'openPage', title: '', detail: '', page })}
                  onReviseFirst={reviseFirst}
                />
              ) : null}
              {m.textAfter ? <RevoText text={m.textAfter} /> : null}
              {knownAction(m.action) ? (
                <PlanCard
                  action={m.action}
                  state={m.actionState}
                  onDo={() => void act(m)}
                  onDismiss={() => chatId && void backend.setActionState(uid, chatId, m.id, 'dismissed')}
                />
              ) : null}
              <FeedbackRow
                feedback={m.feedback}
                onCopy={() => copy([m.text, m.textAfter].filter(Boolean).join('\n\n'))}
                onFeedback={(f) => chatId && void backend.setFeedback(uid, chatId, m.id, f)}
                testID="revo-answer"
              />
            </View>
          ),
        )}
        {pending ? (
          <>
            <UserBubble text={pending.text} attached={pending.attached} testID="revo-question" />
            <Typing />
          </>
        ) : null}
        {refusal && refusal.kind !== 'daily' && refusal.kind !== 'monthly' ? (
          <Text style={[styles.error, { color: palette.secondary }]} testID="revo-error" accessibilityLiveRegion="polite">
            {refusalText(refusal)}
            {refusal.retry ? (
              <Text style={{ color: palette.link }} onPress={() => void ask(refusal.retry!)} suppressHighlighting>
                {'  '}Try again
              </Text>
            ) : null}
          </Text>
        ) : null}
      </ScrollView>
      <View style={[styles.gutter, styles.foot]}>
        {capped ? (
          <LimitCard title="Revo is resting" body="Revo has reached this month’s limit for everyone. It’s back next month. Your conversations stay in History." />
        ) : outOfQuestions ? (
          <LimitCard title={`That’s today’s ${REVO_DAILY_QUESTIONS} questions`} body={`${back.long} Your conversations stay in History.`} />
        ) : (
          <Chips chips={chips} onPick={(c) => void ask(c)} disabled={pending != null} />
        )}
        <RevoComposer
          onSend={(t) => void ask(t)}
          onAdd={onAdd}
          attachments={attachments}
          onRemoveAttach={(i) => onAttachments(attachments.filter((_, j) => j !== i))}
          disabled={outOfQuestions || capped}
          disabledText={capped ? 'Back next month' : back.short}
          busy={pending != null}
          onFocus={onExpand}
        />
      </View>
    </View>
  );
}

/** What the sheet says for a refused or failed question (the limits have their own card). */
export function refusalText(r: { kind: RevoRefusal; message: string }): string {
  if (r.kind === 'offline') return REVO_MESSAGES.offline;
  return r.message || REVO_MESSAGES.unavailable;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  gutter: { paddingHorizontal: 16 },
  list: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, gap: 20 },
  revo: { gap: 14 },
  foot: { gap: 12, paddingTop: 8 },
  error: { fontSize: 15, lineHeight: 21 },
});
