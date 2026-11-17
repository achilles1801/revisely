import React from 'react';
import { AccessibilityInfo, Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { arabicV2, layoutV2, typeV2 } from '../../theme/v2';
import { Sheet } from '../v2/Sheet';
import { PillButton } from '../v2/PillButton';
import { Tap } from '../v2/Tap';
import { describeAyahs, spokenText } from '../../lib/passages';
import { ayahKey } from '../../lib/ayahKeys';
import type { QuranWords } from '../../lib/recite/quranWords';
import type { Mark, MarkInto } from '../../lib/reciteLive/contract';
import { isUnclear, markGroup } from '../../lib/reciteLive/contract';
import { markFill } from './markColours';
import { findingNote, intoLine, intoMarks, markTitle, spokenIntoLine } from '../../lib/reciteLive/describe';
import { drillMarks } from '../../lib/reciteLive/drill';
import type { ScoreLevel } from '../../lib/reciteLive/score';
import { mistakesLabel } from '../../lib/reciteLive/score';
import { CheckMark } from './ReciteMic';
import { Sparkline } from '../reciteMemory/AccuracyChart';
import { peekedLine } from '../../lib/reciteLive/peeked';

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
/** "1 minute 42 seconds", for VoiceOver. */
const spokenClock = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const parts = [m ? `${m} ${m === 1 ? 'minute' : 'minutes'}` : '', sec || !m ? `${sec} ${sec === 1 ? 'second' : 'seconds'}` : ''];
  return parts.filter(Boolean).join(' ');
};

/** Chrome text stops growing here (CLAUDE.md, UI traps); the Arabic word, as in the mark card, at 1.6. */
const CHROME_MAX = 1.4;
const ARABIC_MAX = 1.6;
/** From this text size a finding's Arabic word goes under its title, so it never squeezes the title away. */
export const STACK_FINDINGS_AT = 1.3;

/** Where a finding is: "ayah 23", or with its surah when the take ran into another ("Al-Qasas, ayah 1"). */
export function findingPlace(mark: Mark, manySurahs: boolean): string {
  return manySurahs ? describeAyahs([ayahKey(mark.ayah[0], mark.ayah[1])]) : `ayah ${mark.ayah[1]}`;
}

/** "An-Naml, ayahs 23–31" for the words of a take. */
export function passageOf(words: QuranWords, from: number, to: number): string {
  const keys: number[] = [];
  for (let w = from; w <= to; ) {
    const r = words.ref(w);
    keys.push(ayahKey(r.sura, r.ayah));
    w = words.verseRange(r.sura, r.ayah)[1];
  }
  return describeAyahs(keys);
}

/** "1 marked not a mistake": the Removed list's line. */
export const removedLine = (n: number) => `${n} marked not a mistake`;

/** "1 wrong word, 1 harakat slip, 1 tajweed note, 2 not clear". */
export function findingsLine(marks: Mark[]): string {
  const n = (kinds: Mark['kind'][]) => marks.filter((m) => kinds.includes(m.kind) && !isUnclear(m)).length;
  const parts: string[] = [];
  const wrong = n(['word']);
  const skipped = n(['skipped']);
  const added = n(['added']);
  const slips = n(['harakat', 'letter']);
  const tajweed = n(['tajweed']);
  const unclear = marks.filter(isUnclear).length;
  if (wrong) parts.push(`${wrong} wrong ${wrong === 1 ? 'word' : 'words'}`);
  if (skipped) parts.push(`${skipped} skipped`);
  if (added) parts.push(`${added} extra`);
  if (slips) parts.push(`${slips} harakat ${slips === 1 ? 'slip' : 'slips'}`);
  if (tajweed) parts.push(`${tajweed} tajweed ${tajweed === 1 ? 'note' : 'notes'}`);
  if (unclear) parts.push(`${unclear} not clear`);
  return parts.join(', ');
}

/**
 * The end of a take. Check: the score (by the page), the passage and time, each finding (a tap shows it on the page),
 * Recite again, Done, and whether it was kept as test data. Recite (following along): the passage and time, and for
 * an account without Check, one quiet way to it.
 */
export function TakeSummarySheet({
  visible,
  check,
  words,
  from,
  to,
  seconds,
  marks,
  score,
  kept,
  removed = [],
  onPutBack,
  checkOwned,
  onFinding,
  onInto,
  onCheck,
  onAgain,
  onDrill,
  before = null,
  memory = null,
  premiumNote = null,
  onProgress,
  peeked = [],
  onPeeked,
  onDone,
  onShown,
}: {
  /** One quiet line about Premium in early access (lib/earlyAccess, PREM-1), or null. */
  premiumNote?: string | null;
  visible: boolean;
  check: boolean;
  words: QuranWords | null;
  from: number | null;
  to: number | null;
  seconds: number;
  marks: Mark[];
  score: { text: string; level: ScoreLevel } | null;
  kept: boolean;
  /** Marks taken off with "Not a mistake" during or after the take: listed under Removed, each with Put back. */
  removed?: Mark[];
  onPutBack?: (id: string) => void;
  checkOwned: boolean;
  onFinding: (mark: Mark) => void;
  /** Where a slip went (`into`): that ayah in the reader. Without it, no such lines. */
  onInto?: (into: MarkInto) => void;
  onCheck: () => void;
  onAgain: () => void;
  /** Recite the mistakes again (Check, with something to drill): one take from the first mistake to the last. */
  onDrill?: () => void;
  /** This take recited the mistakes of the one before: what that one found there ("1 wrong word, 1 not clear"). */
  before?: string | null;
  /**
   * Recite's memory (lib/reciteMemory; agreed with Recite UI): the words this take cleared from the page (said right on
   * a second day), and its passage's trend (accuracy over its takes, oldest first, with the line saying it).
   */
  memory?: { cleared: string[]; trend: number[]; line: string | null } | null;
  /** "Your progress here": the passage's progress sheet. */
  onProgress?: () => void;
  /** Words shown by hand during the take, by ayah (Majd, Nov 15 2026): "3 words peeked", a row per ayah. */
  peeked?: { ayah: [number, number]; words: number[] }[];
  /** A peeked row was tapped: its first word, to show on the page. */
  onPeeked?: (w: number) => void;
  onDone: () => void;
  /** The sheet is on screen (its modal has been presented). */
  onShown?: () => void;
}) {
  const { palette } = useTheme();
  const stacked = useWindowDimensions().fontScale >= STACK_FINDINGS_AT;
  // Removed (Majd, Nov 15 2026; Tarteel keeps one too): closed until tapped, so the findings stay first.
  const [removedOpen, setRemovedOpen] = React.useState(false);
  const passage = words && from != null && to != null && to >= from ? passageOf(words, from, to) : '';
  const manySurahs = words != null && from != null && to != null && to >= from && words.ref(from).sura !== words.ref(to).sura;
  // "Not clear" marks never count (Majd, Nov 15 2026), so they come last.
  const mistakes = marks.filter((m) => m.kind !== 'tajweed' && !isUnclear(m)).length;
  const findings = [...marks.filter((m) => !isUnclear(m)), ...marks.filter(isUnclear)];
  const peekedCount = peeked.reduce((n, p) => n + p.words.length, 0);
  // Something to recite again: a mistake (not a tajweed note), or a word peeked.
  const drillable = check && onDrill != null && (drillMarks(marks).length > 0 || peekedCount > 0);
  const scoreColor = score?.level === 'good' ? palette.good : score?.level === 'warn' ? palette.warn : palette.onRedSubtle;
  // Once, when the summary is on screen: what was recited, how long, and (Check) the score. Nothing is spoken while
  // the microphone is on, where it would be recorded with the recitation.
  const spokenSummary = [
    'Your recitation',
    passage ? spokenText(passage) : '',
    spokenClock(seconds),
    check && score ? `${score.text}, ${mistakesLabel(mistakes)}` : '',
    peekedCount ? peekedLine(peekedCount) : '',
  ]
    .filter(Boolean)
    .join('. ');
  const shown = () => {
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibilityWithOptions(spokenSummary, { queue: true });
    else AccessibilityInfo.announceForAccessibility(spokenSummary);
    onShown?.();
  };
  // Pinned under the findings, always on screen (at the largest text on an SE, or with many findings, they sat at the
  // end of a long scroll).
  const actions = (
    <View style={styles.buttons}>
      {drillable ? <PillButton title="Recite the mistakes again" size="lg" onPress={onDrill} testID="take-summary-drill" /> : null}
      <PillButton
        title="Recite again"
        size="lg"
        variant={drillable ? 'outline' : undefined}
        onPress={onAgain}
        testID="take-summary-again"
      />
      <PillButton title="Done" size="lg" variant="outline" onPress={onDone} testID="take-summary-done" />
      {premiumNote ? (
        <Text style={[typeV2.meta, styles.premiumNote, { color: palette.secondary }]} maxFontSizeMultiplier={1.4} testID="take-summary-premium">
          {premiumNote}
        </Text>
      ) : null}
    </View>
  );
  return (
    <Sheet visible={visible} onClose={onDone} onShow={shown} title="Your recitation" scroll pinned={actions} testID="take-summary">
      <View style={styles.head}>
        {check && score ? (
          <View style={styles.scoreRow} accessible accessibilityLabel={`Score ${score.text}, ${mistakesLabel(mistakes)}`}>
            <Text style={[styles.score, typeV2.numeral, { color: scoreColor }]} maxFontSizeMultiplier={1.3} testID="take-summary-score">
              {score.text}
            </Text>
            <Text style={[typeV2.meta, styles.scoreNote, { color: palette.secondary }]} maxFontSizeMultiplier={1.3}>
              {mistakesLabel(mistakes)}
            </Text>
          </View>
        ) : null}
        <Text
          style={[check ? typeV2.body : typeV2.name, { color: palette.text }]}
          maxFontSizeMultiplier={CHROME_MAX}
          accessibilityLabel={[passage ? spokenText(passage) : '', spokenClock(seconds)].filter(Boolean).join(', ')}
          testID="take-summary-passage"
        >
          {[passage, clock(seconds)].filter(Boolean).join(' · ')}
        </Text>
        {check && marks.length ? (
          <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={CHROME_MAX}>
            {findingsLine(marks)}
          </Text>
        ) : null}
        {peekedCount ? (
          <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={CHROME_MAX} testID="take-summary-peeked">
            {peekedLine(peekedCount)}
          </Text>
        ) : null}
        {check && before ? (
          <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={CHROME_MAX} testID="take-summary-before">
            {`Before: ${before}`}
          </Text>
        ) : null}
      </View>
      {check && onInto
        ? intoMarks(marks).map((m, i) => {
            // A slip into a similar ayah, or a swapped ending (the checker's `into`): where it went, a tap away.
            const place = findingPlace(m, manySurahs);
            return (
              <Tap
                key={`into-${m.id}`}
                onPress={() => onInto(m.into)}
                style={[styles.row, { borderTopColor: palette.separator }, i === 0 && styles.firstRow]}
                accessibilityRole="button"
                accessibilityLabel={`${spokenIntoLine(m, place)}. Show it in the reader`}
                testID="take-summary-into"
              >
                <Ionicons name={m.into.ending ? 'return-down-back-outline' : 'git-compare-outline'} size={20} color={palette.secondary} />
                <Text style={[typeV2.body, styles.rowText, { color: palette.text }]} maxFontSizeMultiplier={CHROME_MAX}>
                  {intoLine(m, place)}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={palette.secondary} />
              </Tap>
            );
          })
        : null}
      {check && words
        ? findings.map((m, i) => {
            // The page's highlight (Majd, Nov 15 2026: no red text or round marks): a flat swatch by the kind's name, and
            // the word in ink on its colour.
            const fill = markFill(palette, m);
            const place = findingPlace(m, manySurahs);
            const arabic = (
              <View style={[styles.arWrap, { backgroundColor: fill }, stacked && styles.arStacked]} testID="take-summary-finding-highlight">
                <Text style={[arabicV2(21), { color: palette.text }]} maxFontSizeMultiplier={ARABIC_MAX} testID="take-summary-finding-arabic">
                  {words.uthmani(m.w)}
                </Text>
              </View>
            );
            return (
              <Tap
                key={m.id}
                onPress={() => onFinding(m)}
                style={[styles.row, { borderTopColor: palette.separator }, i === 0 && styles.firstRow]}
                accessibilityRole="button"
                accessibilityLabel={`${markTitle(m)}, ${spokenText(place)}. Show it on the page`}
                testID={`take-summary-finding-${m.kind}`}
              >
                <View style={styles.rowText} testID="take-summary-finding-text">
                  <View style={styles.titleRow}>
                    <View style={[styles.swatch, { backgroundColor: fill }]} testID={`take-summary-swatch-${markGroup(m)}`} />
                    <Text style={[typeV2.name, styles.title, { color: palette.text }]} maxFontSizeMultiplier={CHROME_MAX} testID="take-summary-finding-title">
                      {`${markTitle(m)} · ${place}`}
                    </Text>
                  </View>
                  {findingNote(m) ? (
                    <Text style={[typeV2.meta, { color: palette.secondary }]} numberOfLines={stacked ? 4 : 2} maxFontSizeMultiplier={CHROME_MAX}>
                      {findingNote(m)}
                    </Text>
                  ) : null}
                  {stacked ? arabic : null}
                </View>
                {stacked ? null : arabic}
              </Tap>
            );
          })
        : null}
      {words
        ? peeked.map((p, i) => {
            const place = manySurahs ? describeAyahs([ayahKey(p.ayah[0], p.ayah[1])]) : `ayah ${p.ayah[1]}`;
            const arabic = p.words.map((w) => words.uthmani(w)).join(' ');
            return (
              <Tap
                key={`peeked-${p.ayah.join(':')}`}
                onPress={() => onPeeked?.(p.words[0])}
                style={[styles.row, { borderTopColor: palette.separator }, i === 0 && findings.length === 0 && styles.firstRow]}
                accessibilityRole="button"
                accessibilityLabel={`Peeked, ${spokenText(place)}: ${arabic}. Show it on the page`}
                testID="take-summary-peeked-row"
              >
                <View style={styles.rowText}>
                  <Text style={[typeV2.name, styles.title, { color: palette.text }]} maxFontSizeMultiplier={CHROME_MAX}>
                    {`Peeked · ${place}`}
                  </Text>
                  {stacked ? (
                    <Text style={[arabicV2(21), { color: palette.secondary }]} maxFontSizeMultiplier={ARABIC_MAX} accessibilityLanguage="ar">
                      {arabic}
                    </Text>
                  ) : null}
                </View>
                {stacked ? null : (
                  <Text style={[arabicV2(21), styles.peekedArabic, { color: palette.secondary }]} numberOfLines={1} maxFontSizeMultiplier={ARABIC_MAX} accessibilityLanguage="ar">
                    {arabic}
                  </Text>
                )}
              </Tap>
            );
          })
        : null}
      {check && removed.length && onPutBack ? (
        <View testID="take-summary-removed">
          <Tap
            onPress={() => setRemovedOpen((o) => !o)}
            style={[styles.row, styles.removedHead, { borderTopColor: palette.separator }]}
            accessibilityRole="button"
            accessibilityState={{ expanded: removedOpen }}
            accessibilityLabel={`${removedLine(removed.length)}. ${removedOpen ? 'Hide' : 'Show'} them`}
            testID="take-summary-removed-toggle"
          >
            <Text style={[typeV2.meta, styles.rowText, { color: palette.secondary }]} maxFontSizeMultiplier={CHROME_MAX}>
              {removedLine(removed.length)}
            </Text>
            <Ionicons name={removedOpen ? 'chevron-up' : 'chevron-down'} size={16} color={palette.secondary} />
          </Tap>
          {removedOpen
            ? removed.map((m) => (
                <View key={m.id} style={[styles.row, styles.removedRow, { borderTopColor: palette.separator }]} testID={`take-summary-removed-${m.kind}`}>
                  <View style={styles.rowText}>
                    <View style={styles.titleRow}>
                      <View style={[styles.swatch, { backgroundColor: markFill(palette, m) }]} />
                      <Text style={[typeV2.name, styles.title, { color: palette.secondary }]} maxFontSizeMultiplier={CHROME_MAX}>
                        {`${markTitle(m)} · ${findingPlace(m, manySurahs)}`}
                      </Text>
                    </View>
                  </View>
                  <Tap
                    onPress={() => onPutBack(m.id)}
                    hitSlop={6}
                    style={[styles.putBack, { borderColor: palette.outline }]}
                    accessibilityRole="button"
                    accessibilityLabel={`Put back: ${markTitle(m)}, ${spokenText(findingPlace(m, manySurahs))}`}
                    testID="take-summary-put-back"
                  >
                    <Text style={[styles.putBackText, { color: palette.text }]} maxFontSizeMultiplier={CHROME_MAX}>
                      Put back
                    </Text>
                  </Tap>
                </View>
              ))
            : null}
        </View>
      ) : null}
      {check && memory && memory.cleared.length > 0 ? (
        <View style={[styles.row, { borderTopColor: palette.separator }]} accessible testID="take-summary-cleared">
          <View style={styles.rowText}>
            <Text style={[typeV2.name, { color: palette.text }]} maxFontSizeMultiplier={CHROME_MAX}>
              {`${memory.cleared.length} cleared from the page`}
            </Text>
            <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={CHROME_MAX}>
              Right on 2 different days
            </Text>
          </View>
          <Text style={[arabicV2(20), styles.cleared, { color: palette.text }]} maxFontSizeMultiplier={ARABIC_MAX} numberOfLines={2}>
            {memory.cleared.join(' ')}
          </Text>
        </View>
      ) : null}
      {check && memory?.line && onProgress ? (
        <Tap
          onPress={onProgress}
          style={[styles.row, { borderTopColor: palette.separator }]}
          accessibilityRole="button"
          accessibilityLabel={`Your progress here. ${memory.line}`}
          testID="take-summary-progress"
        >
          <View style={styles.rowText}>
            <Text style={[typeV2.name, { color: palette.text }]} maxFontSizeMultiplier={CHROME_MAX}>
              Your progress here
            </Text>
            <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={CHROME_MAX}>
              {memory.line}
            </Text>
          </View>
          <Sparkline values={memory.trend} />
          <Ionicons name="chevron-forward" size={16} color={palette.secondary} />
        </Tap>
      ) : null}
      {!check && !checkOwned ? (
        <Tap
          onPress={onCheck}
          style={[styles.row, styles.firstRow, { borderTopColor: palette.separator }]}
          accessibilityRole="button"
          accessibilityLabel="See your mistakes, part of Premium"
          testID="take-summary-check"
        >
          <CheckMark size={36} locked />
          <View style={styles.rowText}>
            <Text style={[typeV2.name, { color: palette.premium[0] }]} maxFontSizeMultiplier={CHROME_MAX}>
              See your mistakes
            </Text>
            <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={CHROME_MAX}>
              Mark mistakes shows each one as you recite
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={palette.secondary} />
        </Tap>
      ) : null}
      {kept ? (
        <Text style={[typeV2.meta, styles.kept, { color: palette.secondary }]} maxFontSizeMultiplier={CHROME_MAX}>
          Kept as test data. Software checks it; nobody listens.
        </Text>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  premiumNote: { textAlign: 'center', marginTop: 2 },
  head: { paddingHorizontal: layoutV2.gutter, paddingTop: 16, paddingBottom: 12, gap: 2 },
  scoreRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginBottom: 4 },
  score: { fontSize: 44, lineHeight: 50, fontWeight: '300', letterSpacing: -1 },
  scoreNote: { paddingBottom: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: layoutV2.markGap,
    paddingHorizontal: layoutV2.gutter,
    paddingVertical: 12,
    borderTopWidth: layoutV2.hairline,
  },
  firstRow: {},
  rowText: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flexShrink: 1 },
  /** A flat swatch of the mark's colour, beside its name (never a round mark). */
  swatch: { width: 12, height: 12, borderRadius: 3 },
  arWrap: { borderRadius: 7, paddingHorizontal: 6 },
  peekedArabic: { flexShrink: 1, maxWidth: '55%', writingDirection: 'rtl' },
  removedHead: { paddingVertical: 10 },
  removedRow: { paddingVertical: 8 },
  putBack: { height: 32, paddingHorizontal: 13, borderRadius: 16, borderWidth: 1, justifyContent: 'center' },
  putBackText: { fontSize: 14, fontWeight: '600' },
  arStacked: { alignSelf: 'flex-end', marginTop: 4 },
  cleared: { writingDirection: 'rtl', textAlign: 'right', maxWidth: '45%' },
  buttons: { paddingHorizontal: layoutV2.gutter, paddingTop: 16, gap: 10 },
  kept: { textAlign: 'center', paddingHorizontal: layoutV2.gutter, paddingTop: 10, paddingBottom: 6 },
});
