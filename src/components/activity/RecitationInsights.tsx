// Insights' Recitation section (Revisely Dev, RINS-2): what the takes with Mark mistakes show over Insights' range. The
// score and its weeks, the passages that keep slipping (their words still marked, on their highlights; a tap opens the
// reader there, where the marks show), the similar ayahs gone on with, and one quiet line of words cleared and the
// kinds, words first. Smart Tracking on adds "Rated strong, but slips"; off, nothing about strength (rows say when the
// passage was last recited). Board: ~/Documents/revisely-recite-mocks/insights/board-insights-v1.png.

import React, { useMemo, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { typeV2 } from '../../theme/v2';
import { ChromeText, STACK_AT_SCALE } from './ChromeText';
import { Tap } from '../v2/Tap';
import { openRevo } from '../../lib/revo/open';
import { insightAttachment } from '../../lib/revo/attachments';
import { spokenText } from '../../lib/passages';
import { pageOfVerse } from '../../lib/verses';
import { formatAccuracy } from '../../lib/reciteLive/score';
import type { QuranWords } from '../../lib/recite/quranWords';
import type { MemoryRecord } from '../../lib/reciteMemory/record';
import { recitationInsights, type SlippingPassage } from '../../lib/reciteInsights/insights';
import {
  clearedLine,
  kindsLine,
  passageName,
  scoreLine,
  similarNote,
  similarTitle,
  slipNote,
  strongNote,
  weekLabel,
  weeksSpoken,
  weeksTakeaway,
  weeksToDraw,
} from '../../lib/reciteInsights/describe';
import { markFill } from '../reciteLive/markColours';
import { WordChip } from '../reciteLive/WordChip';
import { useFirstSection } from './sectionPlace';

/** Rows shown before "See all". */
const FIRST_ROWS = 3;
/** Words shown on a row's highlights. */
const MAX_CHIPS = 6;
/** A strong rating (Smart Tracking: 4 or 5). */
const STRONG = 4;

export interface RecitationInsightsProps {
  records: readonly MemoryRecord[];
  /** The word data, for the words' Arabic on their highlights (none until loaded). */
  words: QuranWords | null;
  today: string;
  /** Insights' range (ACT-22): its days, and in words ("in 30 days"). */
  window: number;
  inWords: string;
  smartTracking: boolean;
  /** A page's rating (Smart Tracking on), for "Rated strong, but slips". */
  rating: (page: number) => number | undefined;
  /** Revo is on for the account: the section's Ask. */
  revo: boolean;
  /** The reader at these ayahs, highlighted until the page is turned. */
  onOpenAyahs: (sura: number, from: number, to: number) => void;
}

export function RecitationInsights({ records, words, today, window, inWords, smartTracking, rating, revo, onOpenAyahs }: RecitationInsightsProps) {
  const { palette } = useTheme();
  // First on Insights (ACT-28): no hairline above it.
  const first = useFirstSection();
  const [allSlipping, setAllSlipping] = useState(false);
  const ins = useMemo(() => recitationInsights(records, today, window), [records, today, window]);
  const strong = useMemo(
    () => (smartTracking ? ins.slipping.filter((p) => (rating(pageOfVerse({ sura: p.sura, ayah: p.from })) ?? 0) >= STRONG) : []),
    [smartTracking, ins.slipping, rating],
  );
  const slipping = allSlipping ? ins.slipping : ins.slipping.slice(0, FIRST_ROWS);
  // The weeks are drawn once two had takes; their line then says how the score moved, and the figure gives the takes.
  const weeksDrawn = ins.weeks.filter((w) => w.score !== null).length >= 2;
  const quiet = [clearedLine(ins.cleared.length), ins.takes > 0 ? kindsLine(ins) : null].filter(Boolean) as string[];
  return (
    <View style={[styles.section, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.separator }]} testID="insights-recitation">
      <View style={styles.head}>
        <View style={styles.flex}>
          <ChromeText style={[styles.title, { color: palette.text }]} accessibilityRole="header">
            Recitation
          </ChromeText>
          <ChromeText style={[typeV2.meta, { color: palette.secondary }]}>{`Your takes with Mark mistakes ${inWords}`}</ChromeText>
        </View>
        {revo ? (
          <Tap
            onPress={() => openRevo({ attach: insightAttachment('recitation') })}
            accessibilityRole="button"
            accessibilityLabel="Ask Revo about your recitation"
            style={[styles.ask, { borderColor: palette.outline }]}
            testID="insights-recitation-ask"
          >
            <Ionicons name="sparkles-outline" size={16} color={palette.accentText} />
            <ChromeText style={[typeV2.name, { color: palette.text }]}>Ask</ChromeText>
          </Tap>
        ) : null}
      </View>

      <View style={styles.figure} testID="insights-recitation-figure">
        {ins.score !== null ? (
          <ChromeText style={[styles.big, { color: palette.text }]} numberOfLines={1}>
            {formatAccuracy(ins.score)}
          </ChromeText>
        ) : null}
        <ChromeText style={[typeV2.body, styles.flex, { color: palette.secondary }]}>{scoreLine(ins, inWords, !weeksDrawn)}</ChromeText>
      </View>
      {weeksDrawn ? <WeekBars weeks={ins.weeks} /> : null}

      {ins.slipping.length > 0 ? (
        <>
          <View style={styles.subHead}>
            <ChromeText style={[typeV2.name, styles.flex, { color: palette.text }]} accessibilityRole="header">
              Keeps slipping
            </ChromeText>
            {ins.slipping.length > FIRST_ROWS ? (
              <Tap onPress={() => setAllSlipping((v) => !v)} accessibilityRole="button" hitSlop={8} testID="insights-recitation-see-all">
                <ChromeText style={[typeV2.meta, styles.strong, { color: palette.text }]}>
                  {allSlipping ? 'Show fewer' : `See all ${ins.slipping.length} ›`}
                </ChromeText>
              </Tap>
            ) : null}
          </View>
          {slipping.map((p, i) => (
            <PassageRow
              key={`${p.sura}:${p.from}`}
              first={i === 0}
              title={passageName(p.sura, p.from, p.to)}
              note={slipNote(p, smartTracking, today)}
              chips={words ? <Chips passage={p} words={words} /> : null}
              onPress={() => onOpenAyahs(p.sura, p.from, p.to)}
              testID={`insights-recitation-slip-${p.sura}-${p.from}`}
            />
          ))}
        </>
      ) : null}

      {ins.similar.length > 0 ? (
        <>
          <View style={styles.subHead}>
            <ChromeText style={[typeV2.name, styles.flex, { color: palette.text }]} accessibilityRole="header">
              Similar ayahs
            </ChromeText>
          </View>
          {ins.similar.slice(0, FIRST_ROWS).map((s, i) => (
            <PassageRow
              key={`${s.from.join(':')}>${s.into.join(':')}${s.ending ? 'e' : ''}`}
              first={i === 0}
              title={similarTitle(s)}
              note={similarNote(s, today)}
              onPress={() => onOpenAyahs(s.from[0], s.from[1], s.from[1])}
              testID={`insights-recitation-similar-${s.from[0]}-${s.from[1]}`}
            />
          ))}
        </>
      ) : null}

      {strong.length > 0 ? (
        <>
          <View style={styles.subHead}>
            <ChromeText style={[typeV2.name, styles.flex, { color: palette.text }]} accessibilityRole="header">
              Rated strong, but slips
            </ChromeText>
          </View>
          {strong.slice(0, FIRST_ROWS).map((p, i) => (
            <PassageRow
              key={`${p.sura}:${p.from}`}
              first={i === 0}
              title={passageName(p.sura, p.from, p.to)}
              note={strongNote(p)}
              onPress={() => onOpenAyahs(p.sura, p.from, p.to)}
              testID={`insights-recitation-strong-${p.sura}-${p.from}`}
            />
          ))}
        </>
      ) : null}

      {quiet.length > 0 ? (
        <View style={[styles.quiet, { backgroundColor: palette.fill }]} testID="insights-recitation-quiet">
          {quiet.map((line, i) => (
            <ChromeText key={i} style={[i === 0 ? typeV2.body : typeV2.meta, { color: i === 0 ? palette.text : palette.secondary }]}>
              {line}
            </ChromeText>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function PassageRow({
  title,
  note,
  chips,
  first,
  onPress,
  testID,
}: {
  title: string;
  note: string;
  chips?: React.ReactNode;
  first: boolean;
  onPress: () => void;
  testID: string;
}) {
  const { palette } = useTheme();
  return (
    <Tap
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${spokenText(title)}. ${spokenText(note)}. Open it`}
      style={[styles.row, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.separator }]}
      testID={testID}
    >
      <View style={styles.flex}>
        <ChromeText style={[typeV2.name, { color: palette.text }]}>{title}</ChromeText>
        <ChromeText style={[typeV2.meta, { color: palette.secondary }]}>{note}</ChromeText>
        {chips}
      </View>
      <Ionicons name="chevron-forward" size={16} color={palette.secondary} />
    </Tap>
  );
}

/** The words still marked, in their highlight colours (the page's three), in reading order. */
function Chips({ passage, words }: { passage: SlippingPassage; words: QuranWords }) {
  const { palette } = useTheme();
  const shown = passage.words.slice(0, MAX_CHIPS);
  return (
    <View style={styles.chips} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {shown.map((w) => (
        <WordChip key={w.w} text={words.uthmani(w.w)} fill={markFill(palette, w)} />
      ))}
      {passage.words.length > shown.length ? (
        <ChromeText style={[typeV2.meta, styles.more, { color: palette.secondary }]}>{`+${passage.words.length - shown.length}`}</ChromeText>
      ) : null}
    </View>
  );
}

/** Bars' room: the tallest bar, and the shortest a week with takes gets. */
const BAR_MAX = 52;
const BAR_MIN = 6;

/**
 * The score week by week, as bars (Majd, Nov 16 2026: the bare line "isn't intuitive, it's hard to tell what it's
 * telling me"): a line saying how it moved, then a bar a week with its score over it and the week under it, this week
 * in full colour as Memorization's month is. From the first week with takes; four weeks at large text.
 */
function WeekBars({ weeks }: { weeks: readonly { to: string; score: number | null }[] }) {
  const { palette } = useTheme();
  const large = useWindowDimensions().fontScale >= STACK_AT_SCALE;
  const shown = weeksToDraw(weeks, large ? 4 : 8);
  const scores = shown.map((w) => w.score).filter((x): x is number => x !== null);
  // Bars start a point under the lowest week (and at 95% at most), so a change of a point shows.
  const lo = Math.max(0, Math.min(0.95, Math.floor((Math.min(...scores) - 0.01) * 100) / 100));
  const height = (score: number) => BAR_MIN + Math.round(((BAR_MAX - BAR_MIN) * (score - lo)) / (1 - lo));
  const takeaway = weeksTakeaway(shown);
  return (
    <View
      style={styles.weeks}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${takeaway ? `${takeaway}. ` : ''}${weeksSpoken(shown)}`}
      testID="insights-recitation-weeks"
    >
      {takeaway ? (
        <ChromeText style={[typeV2.name, { color: palette.text }]} testID="insights-recitation-weeks-takeaway">
          {takeaway}
        </ChromeText>
      ) : null}
      <View style={styles.bars}>
        {shown.map((w, i) => {
          const last = i === shown.length - 1;
          return (
            <View key={w.to} style={styles.col}>
              <ChromeText
                style={[styles.small, styles.value, { color: last ? palette.text : palette.secondary }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                {w.score === null ? '–' : formatAccuracy(w.score)}
              </ChromeText>
              <View
                style={[
                  styles.bar,
                  w.score === null
                    ? { height: 2, backgroundColor: palette.separator }
                    : { height: height(w.score), backgroundColor: palette.primary, opacity: last ? 1 : 0.4 },
                ]}
              />
            </View>
          );
        })}
      </View>
      <View style={styles.labels}>
        {shown.map((w, i) => (
          <ChromeText
            key={w.to}
            style={[styles.small, styles.label, { color: i === shown.length - 1 ? palette.text : palette.secondary }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            {weekLabel(w.to, i === shown.length - 1)}
          </ChromeText>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  // As Insights' other sections (InsightsView's section, sectionHead, sectionTitle, figure, big, ask).
  section: { paddingTop: 18, paddingBottom: 18, paddingHorizontal: 16 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  title: { fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.3 },
  figure: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 12, flexWrap: 'wrap', rowGap: 4 },
  big: { fontSize: 28, lineHeight: 32, fontWeight: '700', letterSpacing: -0.6, fontVariant: ['tabular-nums'] },
  ask: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32, borderRadius: 16, borderWidth: 1, paddingHorizontal: 12 },
  weeks: { marginTop: 14 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: BAR_MAX + 22, marginTop: 10 },
  col: { flex: 1, alignItems: 'stretch', justifyContent: 'flex-end' },
  bar: { borderRadius: 5 },
  small: { fontSize: 12, lineHeight: 16 },
  value: { fontWeight: '600', textAlign: 'center', marginBottom: 4 },
  labels: { flexDirection: 'row', gap: 6, marginTop: 6 },
  label: { flex: 1, textAlign: 'center' },
  subHead: { flexDirection: 'row', alignItems: 'baseline', marginTop: 18, marginBottom: 2 },
  strong: { fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  chips: { flexDirection: 'row-reverse', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 6, marginTop: 6 },
  more: { alignSelf: 'center' },
  quiet: { marginTop: 16, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, gap: 4 },
});
