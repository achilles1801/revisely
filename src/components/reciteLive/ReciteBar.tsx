import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { TakeClock, useTakeSeconds } from '../../lib/reciteLive/takeClock';
import { arabicFullV2, typeV2 } from '../../theme/v2';
import { Tap } from '../v2/Tap';
import type { BarWord } from '../../lib/reciteLive/view';
import type { ScoreLevel } from '../../lib/reciteLive/score';
import { CAPSULE_HEIGHT } from '../reader/PlayerCapsule';
import { t } from '../../i18n';
import { chevron } from '../../i18n/direction';
import { toneFill } from './markColours';

/** The capsule's height inside its hairline border (at most half a point each side, on any screen). */
export const BAR_ROOM = CAPSULE_HEIGHT - 1;
/**
 * The words heard, every haraka whole (arabicFullV2): a 51 pt line inside the 52 pt capsule's border, which clips what
 * overflows it. So they grow with the text size only as far as the capsule holds them (at 20 pt, not at all), as the
 * bar itself doesn't grow; VoiceOver and TalkBack read them in full.
 */
export const BAR_WORDS = arabicFullV2(20);
export const BAR_WORDS_MAX_SCALE = Math.max(1, BAR_ROOM / (BAR_WORDS.lineHeight as number));

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** A round icon button on the bar; `active` fills it (the eye while the page is hidden). */
export function BarButton({
  icon,
  label,
  onPress,
  active,
  disabled,
  testID,
  children,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  active?: boolean;
  disabled?: boolean;
  testID?: string;
  children?: React.ReactNode;
}) {
  const { palette } = useTheme();
  return (
    <Tap
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      style={[styles.round, active && { backgroundColor: palette.done }, disabled && styles.disabled]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={active != null ? { selected: active, disabled } : { disabled }}
      testID={testID}
    >
      {children ?? (icon ? <Ionicons name={icon} size={active ? 20 : 22} color={active ? palette.onDone : palette.text} /> : null)}
    </Tap>
  );
}

/** ‹‹: two chevrons, overlapping. */
function DoubleChevron({ color }: { color: string }) {
  return (
    <View style={styles.double}>
      <Ionicons name="chevron-back" size={18} color={color} />
      <Ionicons name="chevron-back" size={18} color={color} style={styles.second} />
    </View>
  );
}

/** The eye; while the page is hidden, with ‹ (the next word) and ‹‹ (the whole ayah) beside it, in one pill. */
export function EyeGroup({
  hidden,
  onToggle,
  onNextWord,
  onWholeAyah,
}: {
  hidden: boolean;
  onToggle: () => void;
  onNextWord: () => void;
  onWholeAyah: () => void;
}) {
  const { palette } = useTheme();
  if (!hidden) {
    return <BarButton icon="eye-off-outline" label={t('reciteLive.bar.hide')} onPress={onToggle} testID="recite-eye" />;
  }
  return (
    <View style={[styles.group, { backgroundColor: palette.bubble }]} testID="recite-eye-group">
      <BarButton icon="eye-outline" label={t('reciteLive.bar.show')} onPress={onToggle} active testID="recite-eye" />
      <BarButton icon="chevron-back" label={t('reciteLive.bar.nextWord')} onPress={onNextWord} testID="recite-next-word" />
      <BarButton label={t('reciteLive.bar.wholeAyah')} onPress={onWholeAyah} testID="recite-whole-ayah">
        <DoubleChevron color={palette.text} />
      </BarButton>
    </View>
  );
}

export function ScorePill({ text, level }: { text: string; level: ScoreLevel }) {
  const { palette } = useTheme();
  const fg = level === 'good' ? palette.good : level === 'warn' ? palette.warn : palette.onRedSubtle;
  const bg = level === 'good' ? palette.goodSubtle : level === 'warn' ? palette.warnSubtle : palette.redSubtle;
  return (
    <View style={[styles.pill, { backgroundColor: bg }]} testID="recite-score">
      <Text style={[styles.pillText, typeV2.numeral, { color: fg }]} maxFontSizeMultiplier={1.2}>
        {text}
      </Text>
    </View>
  );
}

/**
 * The reader's bar while reciting (Revisely Dev), in the player's place: the eye (with ‹ and ‹‹ while hidden), the
 * score (Check), then the time with the last words heard to its right, then Stop. After Stop: a spinner until the
 * checker's final answer; then ✕ closes.
 */
/** A word in the bar as a screen reader reads it: "وَأُوهِيَتْ, wrong word", "…, wrong haraka". */
export function spokenBarWord(w: { text: string; tone: string; part?: 'harakat' | 'letter' }): string {
  const mark =
    w.tone === 'wrong'
      ? t('reciteLive.bar.wrong')
      : w.tone === 'slip'
        ? w.part === 'letter'
          ? t('reciteLive.bar.wrongLetter')
          : t('reciteLive.bar.wrongHaraka')
        : w.tone === 'tajweed'
          ? t('reciteLive.bar.tajweed')
          : w.tone === 'corrected'
            ? t('reciteLive.bar.corrected')
            : '';
  return mark ? t('reciteLive.bar.wordWithMark', { word: w.text, mark }) : w.text;
}

export function ReciteBar({
  hidden,
  onToggleHidden,
  onNextWord,
  onWholeAyah,
  score,
  seconds,
  clock: takeClock,
  recording,
  words,
  status,
  phase,
  paused = false,
  slow = false,
  onPause,
  onResume,
  onStop,
  onClose,
  surface,
  onScore,
  result = null,
  undo = null,
  note = null,
}: {
  hidden: boolean;
  onToggleHidden: () => void;
  onNextWord: () => void;
  onWholeAyah: () => void;
  score: { text: string; level: ScoreLevel } | null;
  /** The take's time, given as a number (What's new's moment), or its clock (a take: only the bar re-renders each second). */
  seconds?: number;
  clock?: TakeClock | null;
  /** A recording is being kept (the red dot). */
  recording: boolean;
  words: BarWord[];
  /** Shown in the words' place while there are none ("Listening…"). */
  status: string;
  /** live: reciting; checking: stopped, the final answer coming; done: finished (✕). */
  phase: 'live' | 'checking' | 'done';
  /** The take is paused (the microphone off, the take open). */
  paused?: boolean;
  /** The checker has fallen behind a slow connection: a quiet line in the words' place (Nov 22 2026). */
  slow?: boolean;
  /** Pause and resume the take (shown while it's live). */
  onPause?: () => void;
  onResume?: () => void;
  onStop: () => void;
  onClose: () => void;
  surface: { background: string; border: string };
  /** The score was tapped: what the take has found so far, or its summary once it's done (Majd, Nov 21 2026). */
  onScore?: () => void;
  /**
   * Once the take is done: its result in the words' place ("96% · 1 mistake ›", or "Done ›"), and a tap on it opens the
   * summary. Nothing opens by itself after Stop (Majd, Nov 22 2026: "nothing pops up in my face at any time").
   */
  result?: { text: string; onPress: () => void } | null;
  /**
   * A mark just called Not a mistake: "Marked not a mistake" and Undo in the words' place for a few seconds, the bar's
   * buttons staying (RECITE-25). It used to be a note above the bar, over the page's last lines.
   */
  undo?: { text: string; onUndo: () => void } | null;
  /**
   * A line that explains, once, in the words' place for a few seconds (RECITE-31: what the first amber mark means), with
   * a dot in the colour it explains. Quiet, as the slow line is: never a pop-up, a sound or speech over the recitation.
   */
  note?: { text: string; colour: string } | null;
}) {
  const { palette } = useTheme();
  const ticking = useTakeSeconds(takeClock);
  const secs = takeClock ? ticking : seconds ?? 0;
  // Each word as VoiceOver and TalkBack read it, its mark said in words: in the bar a mistake is a colour behind the
  // word, and colour must never be the only signal.
  const spoken = words.map(spokenBarWord).join(' ');
  const slowNow = slow && !paused && phase === 'live';
  const shownWords = paused || slowNow ? [] : words;
  const shownStatus = paused ? t('reciteLive.bar.paused') : slowNow ? t('reciteLive.bar.slow') : status;
  const noteNow = note && !undo && phase !== 'done' ? note : null;
  return (
    <View
      style={[styles.capsule, { backgroundColor: surface.background, borderColor: surface.border }]}
      testID="recite-bar"
    >
      <EyeGroup hidden={hidden} onToggle={onToggleHidden} onNextWord={onNextWord} onWholeAyah={onWholeAyah} />
      {score && onScore ? (
        <Tap
          onPress={onScore}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={t('reciteLive.bar.scoreLabel', { score: score.text })}
          testID="recite-score-tap"
        >
          <ScorePill text={score.text} level={score.level} />
        </Tap>
      ) : score ? (
        <ScorePill text={score.text} level={score.level} />
      ) : null}
      {/* Not a live region: its clock changes every second, and TalkBack would speak each one over the recitation, where
          the microphone hears it. VoiceOver reads it when focused; the summary is spoken once when it shows. */}
      <View style={styles.middle} accessible={!(phase === 'done' && result) && !undo} accessibilityLabel={`${clock(secs)}${recording && phase === 'live' && !paused ? ', recording' : ''}. ${paused ? shownStatus : noteNow ? noteNow.text : spoken || status}`} testID="recite-middle">
        {undo ? (
          <View style={styles.undo} accessibilityLiveRegion="polite" testID="recite-undo-note">
            <Text style={[typeV2.meta, styles.undoText, { color: palette.text }]} numberOfLines={1} maxFontSizeMultiplier={1.2}>
              {undo.text}
            </Text>
            <Tap
              onPress={undo.onUndo}
              hitSlop={8}
              style={[styles.pill, { backgroundColor: palette.fill }]}
              accessibilityRole="button"
              accessibilityLabel={t('reciteLive.bar.undoLabel', { text: undo.text })}
              testID="recite-undo"
            >
              <Text style={[styles.pillText, { color: palette.text }]} maxFontSizeMultiplier={1.2}>
                {t('common.undo')}
              </Text>
            </Tap>
          </View>
        ) : null}
        <View style={[styles.time, undo && styles.away]}>
          {recording && phase === 'live' && !paused ? (
            <View style={[styles.dot, { backgroundColor: palette.red }]} testID="recite-recording" />
          ) : null}
          <Text style={[styles.timeText, typeV2.numeral, { color: palette.secondary }]} maxFontSizeMultiplier={1.2} testID="recite-time">
            {clock(secs)}
          </Text>
        </View>
        {undo ? null : noteNow ? (
          <View style={styles.note} testID="recite-note">
            <View style={[styles.noteDot, { backgroundColor: noteNow.colour }]} />
            <Text style={[typeV2.meta, styles.noteText, { color: palette.text }]} numberOfLines={2} maxFontSizeMultiplier={1.2}>
              {noteNow.text}
            </Text>
          </View>
        ) : phase === 'done' && result ? (
          <Tap
            onPress={result.onPress}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('reciteLive.bar.resultLabel', { result: result.text })}
            testID="recite-result"
          >
            <Text style={[typeV2.meta, { color: palette.text }]} numberOfLines={1} maxFontSizeMultiplier={1.2}>
              {`${result.text}\u00a0${chevron()}`}
            </Text>
          </Tap>
        ) : shownWords.length ? (
          <Text style={[BAR_WORDS, styles.words]} numberOfLines={1} maxFontSizeMultiplier={BAR_WORDS_MAX_SCALE} testID="recite-words">
            {shownWords.map((w, i) => (
              <Text
                key={w.w}
                // A mistake is a highlight behind the word, as on the page; blue is only the word being said.
                style={{
                  color: w.tone === 'current' ? palette.followInk : palette.text,
                  backgroundColor: toneFill(palette, w.tone),
                }}
                testID={`recite-word-${w.tone}`}
              >
                {i > 0 ? ' ' : ''}
                {w.text}
              </Text>
            ))}
          </Text>
        ) : (
          <Text style={[typeV2.meta, { color: palette.secondary }]} numberOfLines={1} maxFontSizeMultiplier={1.2} testID="recite-status">
            {shownStatus}
          </Text>
        )}
      </View>
      {phase === 'live' && onPause && onResume ? (
        paused ? (
          <BarButton icon="play" label={t('reciteLive.bar.resume')} onPress={onResume} testID="recite-resume" />
        ) : (
          <BarButton icon="pause" label={t('reciteLive.bar.pause')} onPress={onPause} testID="recite-pause" />
        )
      ) : null}
      {phase === 'done' ? (
        <BarButton icon="close" label={t('common.close')} onPress={onClose} testID="recite-close" />
      ) : (
        <Tap
          onPress={onStop}
          disabled={phase === 'checking'}
          hitSlop={6}
          style={[styles.stop, { backgroundColor: palette.primary }]}
          accessibilityRole="button"
          accessibilityLabel={phase === 'checking' ? t('reciteLive.bar.checking') : t('reciteLive.bar.stop')}
          accessibilityState={{ busy: phase === 'checking' }}
          testID="recite-stop"
        >
          {phase === 'checking' ? (
            <ActivityIndicator size="small" color={palette.onPrimary} />
          ) : (
            <View style={[styles.square, { backgroundColor: palette.onPrimary }]} />
          )}
        </Tap>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  capsule: {
    height: CAPSULE_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 6,
    borderRadius: CAPSULE_HEIGHT / 2,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  round: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.4 },
  group: { flexDirection: 'row', alignItems: 'center', borderRadius: 20, padding: 2 },
  double: { flexDirection: 'row', alignItems: 'center' },
  second: { marginLeft: -10 },
  pill: { height: 30, paddingHorizontal: 11, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  pillText: { fontSize: 14, fontWeight: '600' },
  middle: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  undo: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  undoText: { flexShrink: 1 },
  note: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 },
  noteDot: { width: 9, height: 9, borderRadius: 4.5, flexShrink: 0 },
  noteText: { flexShrink: 1, lineHeight: 16 },
  // The time steps aside while Undo has the words' place (it keeps its clock running).
  away: { display: 'none' },
  time: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 0 },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  timeText: { fontSize: 14, fontWeight: '600' },
  words: { writingDirection: 'rtl', flexShrink: 1 },
  stop: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  square: { width: 13, height: 13, borderRadius: 3.5 },
});
