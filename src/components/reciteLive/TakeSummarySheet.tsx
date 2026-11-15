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
import type { Mark } from '../../lib/reciteLive/contract';
import { isUnclear, severityOf } from '../../lib/reciteLive/contract';
import { findingNote, markTitle } from '../../lib/reciteLive/describe';
import type { ScoreLevel } from '../../lib/reciteLive/score';
import { mistakesLabel } from '../../lib/reciteLive/score';
import { CheckMark } from './ReciteMic';

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
  if (added) parts.push(`${added} added`);
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
  checkOwned,
  onFinding,
  onCheck,
  onAgain,
  onDone,
  onShown,
}: {
  visible: boolean;
  check: boolean;
  words: QuranWords | null;
  from: number | null;
  to: number | null;
  seconds: number;
  marks: Mark[];
  score: { text: string; level: ScoreLevel } | null;
  kept: boolean;
  checkOwned: boolean;
  onFinding: (mark: Mark) => void;
  onCheck: () => void;
  onAgain: () => void;
  onDone: () => void;
  /** The sheet is on screen (its modal has been presented). */
  onShown?: () => void;
}) {
  const { palette } = useTheme();
  const stacked = useWindowDimensions().fontScale >= STACK_FINDINGS_AT;
  const passage = words && from != null && to != null && to >= from ? passageOf(words, from, to) : '';
  const manySurahs = words != null && from != null && to != null && to >= from && words.ref(from).sura !== words.ref(to).sura;
  // "Not clear" marks never count (Majd, Nov 15 2026), so they come last.
  const mistakes = marks.filter((m) => m.kind !== 'tajweed' && !isUnclear(m)).length;
  const findings = [...marks.filter((m) => !isUnclear(m)), ...marks.filter(isUnclear)];
  const scoreColor = score?.level === 'good' ? palette.good : score?.level === 'warn' ? palette.warn : palette.onRedSubtle;
  // Once, when the summary is on screen: what was recited, how long, and (Check) the score. Nothing is spoken while
  // the microphone is on, where it would be recorded with the recitation.
  const spokenSummary = [
    'Your recitation',
    passage ? spokenText(passage) : '',
    spokenClock(seconds),
    check && score ? `${score.text}, ${mistakesLabel(mistakes)}` : '',
  ]
    .filter(Boolean)
    .join('. ');
  const shown = () => {
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibilityWithOptions(spokenSummary, { queue: true });
    else AccessibilityInfo.announceForAccessibility(spokenSummary);
    onShown?.();
  };
  return (
    <Sheet visible={visible} onClose={onDone} onShow={shown} title="Your recitation" scroll testID="take-summary">
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
      </View>
      {check && words
        ? findings.map((m, i) => {
            const mistake = severityOf(m) === 'mistake';
            const color = mistake ? palette.red : palette.warn;
            const place = findingPlace(m, manySurahs);
            const arabic = (
              <Text
                style={[arabicV2(21), { color }, stacked && styles.arStacked]}
                maxFontSizeMultiplier={ARABIC_MAX}
                testID="take-summary-finding-arabic"
              >
                {words.uthmani(m.w)}
              </Text>
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
                <View style={[styles.mark, { backgroundColor: mistake ? palette.redSubtle : palette.warnSubtle }]}>
                  <Ionicons
                    name={m.kind === 'tajweed' ? 'pulse-outline' : mistake ? 'close' : isUnclear(m) ? 'ear-outline' : 'remove-outline'}
                    size={18}
                    color={mistake ? palette.onRedSubtle : palette.warn}
                  />
                </View>
                <View style={styles.rowText} testID="take-summary-finding-text">
                  <Text style={[typeV2.name, { color: palette.text }]} maxFontSizeMultiplier={CHROME_MAX} testID="take-summary-finding-title">
                    {`${markTitle(m)} · ${place}`}
                  </Text>
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
      <View style={styles.buttons}>
        <PillButton title="Recite again" size="lg" onPress={onAgain} testID="take-summary-again" />
        <PillButton title="Done" size="lg" variant="outline" onPress={onDone} testID="take-summary-done" />
      </View>
      {kept ? (
        <Text style={[typeV2.meta, styles.kept, { color: palette.secondary }]} maxFontSizeMultiplier={CHROME_MAX}>
          Kept as test data. Software checks it; nobody listens.
        </Text>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
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
  mark: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, minWidth: 0 },
  arStacked: { alignSelf: 'flex-end', marginTop: 4 },
  buttons: { paddingHorizontal: layoutV2.gutter, paddingTop: 16, gap: 10 },
  kept: { textAlign: 'center', paddingHorizontal: layoutV2.gutter, paddingTop: 10, paddingBottom: 6 },
});
