import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../context/ThemeContext';
import { aheadLine, NBSP, type PartialPages, type TodayLines, type TodayStatus } from '../../../lib/todayLines';
import { typeV2 } from '../../../theme/v2';
import { ProgressRing } from '../../activity/DayParts';
import { FirstWords } from '../../v2/FirstWords';
import { Mark } from '../../v2/Mark';
import { PillButton } from '../../v2/PillButton';
import { ThreadRow } from '../../v2/ThreadRow';
import { Tap } from '../../v2/Tap';
import { formatNumber, t } from '../../../i18n';
import { forwardIcon } from '../../../i18n/direction';
import { HEADER_MAX_SCALE } from './TodayPost';

/** The ring's size and stroke (Majd's pick of the Home revision boards, direction C). */
export const RING_SIZE = 136;
const STROKE = 9;
/** The figures inside the ring grow a little with Dynamic Type, never past its inside (118pt). */
const RING_MAX_SCALE = 1.2;
/** The lines under it, as the Today post's (two lines at most, then they shrink to fit). */
const LINES_MAX_SCALE = 1.6;

/** What the ring shows (HOME-10). */
export type RingState =
  | { kind: 'todo'; total: number }
  | { kind: 'partial'; done: number; total: number }
  | { kind: 'done'; pages: number }
  | { kind: 'rest' }
  | { kind: 'empty' };

/** The ring's state from the lines Home worked out (lib/homeToday): their count is the session's, carried pages too. */
export function ringState(lines: TodayLines, status: TodayStatus, done: ReadonlySet<number>): RingState {
  if (lines.rest) return { kind: 'rest' };
  if (lines.empty) return { kind: 'empty' };
  if (status === 'completed') return { kind: 'done', pages: done.size };
  if (lines.detail.kind === 'progress') return { kind: 'partial', done: lines.detail.done, total: lines.detail.total };
  return { kind: 'todo', total: lines.total };
}

/** The ring itself: empty, filling, full in the done colour; dashed on a rest day and with nothing memorized. */
function Ring({ state }: { state: RingState }) {
  const { palette } = useTheme();
  const r = (RING_SIZE - STROKE) / 2;
  const c = 2 * Math.PI * r;
  const dashed = state.kind === 'rest' || state.kind === 'empty';
  const fraction = state.kind === 'done' ? 1 : state.kind === 'partial' ? Math.min(1, state.done / Math.max(1, state.total)) : 0;
  const mid = RING_SIZE / 2;
  const figure = { maxFontSizeMultiplier: RING_MAX_SCALE, numberOfLines: 1 };
  let inside: React.ReactNode;
  if (state.kind === 'todo' || state.kind === 'partial') {
    const n = state.kind === 'todo' ? state.total : state.done;
    const label = state.kind === 'todo' ? t('home.today.ringToday', { count: state.total }) : t('home.today.ringOf', { count: state.total });
    inside = (
      <>
        <Text style={[styles.count, typeV2.numeral, { color: palette.text }]} {...figure} testID="today-ring-count">
          {formatNumber(n)}
        </Text>
        <Text style={[typeV2.meta, { color: palette.secondary }]} {...figure} testID="today-ring-label">
          {label}
        </Text>
      </>
    );
  } else if (state.kind === 'done') {
    inside = (
      <>
        <View testID="today-ring-check">
          <Ionicons name="checkmark" size={44} color={palette.doneText} />
        </View>
        <Text style={[typeV2.meta, { color: palette.secondary }]} {...figure} testID="today-ring-label">
          {t('lib.today.pages', { count: state.pages })}
        </Text>
      </>
    );
  } else {
    const rest = state.kind === 'rest';
    inside = (
      <>
        <View testID={rest ? 'today-ring-rest' : 'today-ring-start'}>
          <Ionicons name={rest ? 'moon-outline' : 'add'} size={rest ? 32 : 40} color={rest ? palette.secondary : palette.accentText} />
        </View>
        <Text style={[typeV2.meta, { color: palette.secondary }]} {...figure} testID="today-ring-label">
          {rest ? t('home.today.ringRest') : t('home.today.ringStart')}
        </Text>
      </>
    );
  }
  return (
    // The lines under it say the same in words (and VoiceOver reads them), so the ring itself is a picture.
    <View style={styles.ring} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID="today-ring">
      <Svg width={RING_SIZE} height={RING_SIZE} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="today-ring-fill" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={palette.progress[0]} />
            <Stop offset="1" stopColor={palette.progress[1]} />
          </LinearGradient>
        </Defs>
        <Circle
          cx={mid}
          cy={mid}
          r={r}
          fill="none"
          stroke={palette.track}
          strokeWidth={dashed ? 3 : STROKE}
          strokeDasharray={dashed ? '2 7' : undefined}
          strokeLinecap={dashed ? 'round' : undefined}
          testID={dashed ? 'today-ring-dashed' : 'today-ring-track'}
        />
        {fraction > 0 ? (
          <Circle
            cx={mid}
            cy={mid}
            r={r}
            fill="none"
            stroke={state.kind === 'done' ? palette.done : 'url(#today-ring-fill)'}
            strokeWidth={STROKE}
            strokeDasharray={`${c * fraction} ${c}`}
            strokeLinecap="round"
            transform={`rotate(-90 ${mid} ${mid})`}
            testID="today-ring-arc"
          />
        ) : null}
      </Svg>
      {inside}
    </View>
  );
}

/**
 * Today on Home as a ring (HOME-10, Revisely Dev; Majd's pick of the Home revision boards, direction C): the name line as
 * the Today post's, then, centred, a ring of today's pages, where today starts and the rest of the day in two short lines
 * ("Change" ending the second), the one button, and the catch-up (Add to today) or the next day as a quiet line under it.
 * The words are the Today post's (lib/todayLines), with the page count moved into the ring.
 */
export function TodayRing({
  name,
  initial,
  picture,
  onPicture,
  status,
  done,
  partial,
  streak,
  streakGrace,
  onPrimary,
  onJump,
  catchUp,
  onCarryOver,
  carrying,
  separator = false,
  ahead,
  onAhead,
  help,
  lines,
  footer,
}: {
  name: string;
  initial: string;
  picture?: React.ReactNode;
  onPicture?: () => void;
  status: TodayStatus;
  done: ReadonlySet<number>;
  partial?: PartialPages;
  streak: number;
  streakGrace?: { previous: number; progress: { scheduled: number; credited: number } } | null;
  onPrimary: () => void;
  /** Where today starts: "Change" (and a tap on the lines) opens Jump to (HOME-3). */
  onJump: () => void;
  /** The catch-up offer (catchUpLine's quiet form), or none. */
  catchUp: { title: string; label: string } | null;
  onCarryOver: () => void;
  carrying: boolean;
  /** The hairline under it: only when a post follows (HOME-6). */
  separator?: boolean;
  /** Done today: the next revision day, for the quiet line that opens it. */
  ahead?: { lead: string; first: number } | null;
  onAhead?: () => void;
  help?: React.ReactNode;
  /** The lines as Home worked them out (lib/homeToday). */
  lines: TodayLines;
  /** A beginner's quiet line, last under the ring (BEGIN-2, BEGIN-3); none on today's path. */
  footer?: React.ReactNode;
}) {
  const { palette } = useTheme();
  const grace = streakGrace ?? null;
  const meta = grace
    ? t('home.today.streak', { days: grace.previous })
    : streak > 0
      ? t('home.today.streak', { days: streak })
      : t('common.today');
  const state = ringState(lines, status, done);
  const fit = { numberOfLines: 2, adjustsFontSizeToFit: true, minimumFontScale: 0.7, maxFontSizeMultiplier: LINES_MAX_SCALE };
  const title = state.kind === 'done' ? t('home.today.ringDone') : lines.title.text;
  const change = lines.title.chevron;

  const words = (
    <>
      <Text style={[styles.title, { color: palette.text }]} {...fit} testID="today-title">
        {title}
      </Text>
      <FirstWords words={lines.words} style={styles.centred} testID="today-first-words" />
      {lines.brief || change ? (
        <Text style={[typeV2.body, styles.center, { color: palette.secondary }]} {...fit} testID="today-detail">
          {lines.brief}
          {change ? (
            // "Change" ends the line, held to its last word so it never starts a line alone (HOME-3).
            <>
              {lines.brief ? `${NBSP}·${NBSP}` : ''}
              <Text style={{ color: palette.accentText }} testID="today-change">
                {t('home.today.change')}
              </Text>
            </>
          ) : null}
        </Text>
      ) : null}
    </>
  );

  return (
    <View testID="today-thread">
      <View testID="today-post">
        <ThreadRow
          mark={
            picture ? (
              <Tap onPress={onPicture} accessibilityRole="button" accessibilityLabel={t('home.today.openAccount')} testID="today-picture">
                {picture}
              </Tap>
            ) : (
              <Mark label={initial} />
            )
          }
          name={name || t('common.today')}
          meta={name ? meta : undefined}
          figure={
            grace || help ? (
              <View style={styles.figure}>
                {grace ? (
                  <ProgressRing
                    fraction={grace.progress.scheduled > 0 ? grace.progress.credited / grace.progress.scheduled : 0}
                    done={false}
                    size={18}
                  />
                ) : null}
                {help}
              </View>
            ) : undefined
          }
          headerMaxScale={HEADER_MAX_SCALE}
          separator={false}
          testID="today-ring-header"
        >
          {null}
        </ThreadRow>
        <View style={styles.body} testID="today-ring-body">
          <Ring state={state} />
          {lines.empty ? (
            <View style={styles.lines} testID="today-summary">
              {words}
            </View>
          ) : (
            // Done, it shows no "Change", but a tap still opens Jump to (HOME-3).
            <Tap
              onPress={onJump}
              accessibilityRole="button"
              accessibilityLabel={lines.label}
              accessibilityHint={t('home.today.changeHint')}
              style={styles.lines}
              testID="today-summary"
            >
              {words}
            </Tap>
          )}
          {lines.cta ? (
            <PillButton
              title={lines.cta}
              onPress={onPrimary}
              variant={lines.solid ? 'solid' : 'outline'}
              style={styles.cta}
              testID="today-cta"
            />
          ) : null}
          {catchUp ? (
            // HOME-5: the missed pages are a quiet line under the one button; a tap anywhere on it adds them.
            <Tap
              onPress={onCarryOver}
              disabled={carrying}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={t('home.today.addToTodayLabel', { line: catchUp.label })}
              accessibilityState={{ disabled: carrying }}
              style={styles.quiet}
              testID="today-carry-over"
            >
              <Text style={[typeV2.meta, styles.center, { color: palette.secondary }]} maxFontSizeMultiplier={LINES_MAX_SCALE}>
                <Text testID="today-catch-up">{catchUp.title}</Text>
                {NBSP}
                {NBSP}
                <Text style={[styles.add, { color: palette.accentText }]} testID="today-add">
                  {(carrying ? t('home.today.adding') : t('home.today.addToToday')).split(' ').join(NBSP)}
                </Text>
              </Text>
            </Tap>
          ) : null}
          {ahead && onAhead && status === 'completed' && !lines.rest ? (
            <Tap
              onPress={onAhead}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={aheadLine(ahead.lead, ahead.first, partial).label}
              style={styles.quiet}
              testID="today-ahead"
            >
              <Text style={[typeV2.meta, styles.center, { color: palette.secondary }]} maxFontSizeMultiplier={LINES_MAX_SCALE}>
                {aheadLine(ahead.lead, ahead.first, partial).text}
                {NBSP}
                <Ionicons name={forwardIcon()} size={13} color={palette.secondary} allowFontScaling />
              </Text>
            </Tap>
          ) : null}
          {footer}
        </View>
      </View>
      {separator ? <View style={[styles.separator, { backgroundColor: palette.separator }]} testID="today-post-separator" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  figure: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  body: { alignItems: 'center', paddingHorizontal: 24, paddingBottom: 20 },
  ring: { width: RING_SIZE, height: RING_SIZE, alignItems: 'center', justifyContent: 'center' },
  count: { fontSize: 36, lineHeight: 42, fontWeight: '700', letterSpacing: -1 },
  lines: { alignItems: 'center', marginTop: 14, alignSelf: 'stretch' },
  title: { fontSize: 19, lineHeight: 25, fontWeight: '700', letterSpacing: -0.4, textAlign: 'center' },
  center: { textAlign: 'center' },
  centred: { alignSelf: 'center' },
  // The board's pill: centred, as wide as its words, a little taller than the post's (PillButton lg stretches).
  cta: { marginTop: 18, minHeight: 44, paddingHorizontal: 28 },
  quiet: { marginTop: 14, alignSelf: 'stretch' },
  add: { fontWeight: '600' },
  separator: { height: StyleSheet.hairlineWidth },
});
