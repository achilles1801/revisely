// Insights' Recitation (Revisely Dev): as a row on the one Activity tab (ACT-35), and as its own page from its point (ACT-44;
// Majd, Nov 27 2026: "the point of the graph is to illustrate a users trend in making mistakes categorized by the type of
// mistake and also taking into account other metrics that are USEFUL like knowing what mistakes has the user corrected and
// doesn't make anymore and which are still slipping all the time and maybe even length of recitations etc ... we always
// need to keep in mind, what is the POINT or benefit of this screen"). The point: "Am I getting better at reciting from
// memory, and what do I still need to fix?" Board: ~/Documents/revisely-today-mocks/insights-v2/board-recitation.png.
//   - Mistakes a page over Insights' range, with its trend against the period before (Apple Fitness's Trends).
//   - Mistakes by kind week by week (a year: month by month), on Insights' one chart (TapChart, ACT-41): a tap on a week
//     sets the line above it, a tap on a kind shows it alone.
//   - The words fixed (said right on 2 days) against those still slipping, the share fixed, the worst passage and "See
//     all", which also lists the similar ayahs gone on with and, with Smart Tracking, passages rated strong that slip.
//   - Your takes: how long they usually are, the longest, and whether long takes go better than short ones.

import React, { useMemo, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { typeV2 } from '../../theme/v2';
import { SectionRow } from './SectionRow';
import { recitationRow } from '../../lib/activityRowValues';
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
import { passageName, scoreLine, similarNote, similarTitle, slipNote, strongNote } from '../../lib/reciteInsights/describe';
import {
  CHART_SPANS,
  fixedAndSlipping,
  KINDS,
  kindBars,
  perPage,
  rangeTrend,
  spanForRange,
  takeLengths,
  type ChartSpan,
  type KindKey,
} from '../../lib/reciteInsights/trend';
import {
  barLabel,
  barLine,
  barSpoken,
  barValue,
  chartTitle,
  fixedTile,
  heroLine,
  kindName,
  perPageText,
  shareLine,
  slippingTile,
  spanIn,
  spanLabel,
  takesLine,
  takesTitle,
  trendChip,
} from '../../lib/reciteInsights/trendWords';
import { markFill } from '../reciteLive/markColours';
import { WordChip } from '../reciteLive/WordChip';
import { ChartPills, TapChart, type ChartBar } from './TapChart';
import { useFirstSection, useSectionAlone } from './sectionPlace';
import { formatNumber, t } from '../../i18n';
import { forwardIcon } from '../../i18n/direction';
import type { RangeSpan } from '../../lib/insightsRange';

/** The page's figures' sizes, for the fit checks (tests/scenarios/properties/recitationPage.property.ts). */
export const PAGE_TYPE = { figure: 34, unit: 17, tileFigure: 28 } as const;

/**
 * Whether the two tiles stack: from the text size where Insights stacks its figures, or with a figure of 1,000 or more on
 * a phone under 400 pt wide (an SE's tile holds about four characters at that size), or of 100,000 anywhere.
 */
export function tilesStack(longestChars: number, width: number, fontScale: number): boolean {
  return fontScale >= STACK_AT_SCALE || longestChars >= (width < 400 ? 5 : 7);
}

/** Words shown on a passage's highlights. */
const MAX_CHIPS = 6;
/** A strong rating (Smart Tracking: 4 or 5). */
const STRONG = 4;

export interface RecitationInsightsProps {
  records: readonly MemoryRecord[];
  /** The word data: the words' Arabic on their highlights, and each take's pages (an average page's words until loaded). */
  words: QuranWords | null;
  today: string;
  /** Insights' range (ACT-22): its days, and in words ("in 30 days"). */
  window: number;
  inWords: string;
  /** The range's other words (lib/insightsRange `rangeSpan`): "last 30 days", "in the last 30 days", the period before. */
  span?: Pick<RangeSpan, 'lastWords' | 'inTheLast' | 'before' | 'all'>;
  smartTracking: boolean;
  /** A page's rating (Smart Tracking on), for "Rated strong, but slips". */
  rating: (page: number) => number | undefined;
  /** Revo is on for the account: the section's Ask. */
  revo: boolean;
  /** The reader at these ayahs, highlighted until the page is turned. */
  onOpenAyahs: (sura: number, from: number, to: number) => void;
  /** Drawn as its row on the one Activity tab (ACT-35): the row's tap, and whether it is the list's last. */
  row?: () => void;
  last?: boolean;
}

export function RecitationInsights(props: RecitationInsightsProps) {
  const { records, today, window, inWords, row, last } = props;
  const ins = useMemo(() => (row ? recitationInsights(records, today, window, null) : null), [row, records, today, window]);
  if (row && ins) {
    return (
      <SectionRow
        title={t('activity.recitation.title')}
        line={scoreLine(ins, inWords, true)}
        figure={recitationRow(ins.score)?.figure ?? null}
        onPress={row}
        separator={!last}
        testID="insights-row-recitation"
      />
    );
  }
  return <RecitationPage {...props} />;
}

function RecitationPage({ records, words, today, window, inWords, span, smartTracking, rating, revo, onOpenAyahs }: RecitationInsightsProps) {
  const { palette } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  // First on Insights (ACT-29): no hairline above it.
  const first = useFirstSection();
  const alone = useSectionAlone();
  const range = span ?? { lastWords: inWords, inTheLast: inWords, before: null, all: false };
  const [chartSpan, setChartSpan] = useState<ChartSpan>(() => spanForRange(window, range.all));
  const [picked, setPicked] = useState<string | null>(null);
  const [kindAlone, setKindAlone] = useState<KindKey | null>(null);
  const [allPassages, setAllPassages] = useState(false);

  const trend = useMemo(() => rangeTrend(records, today, window, range.all, words), [records, today, window, range.all, words]);
  const bars = useMemo(() => kindBars(records, today, chartSpan, words), [records, today, chartSpan, words]);
  const fromDay = useMemo(() => {
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - (window - 1));
    return d.toISOString().slice(0, 10);
  }, [today, window]);
  const fixed = useMemo(() => fixedAndSlipping(records, fromDay, today), [records, fromDay, today]);
  const lengths = useMemo(() => takeLengths(records, today, window, words), [records, today, window, words]);
  const ins = useMemo(() => recitationInsights(records, today, window, words), [records, today, window, words]);
  const strong = useMemo(
    () => (smartTracking ? ins.slipping.filter((p) => (rating(pageOfVerse({ sura: p.sura, ayah: p.from })) ?? 0) >= STRONG) : []),
    [smartTracking, ins.slipping, rating],
  );

  const colours: Record<KindKey, string> = { words: palette.red, hesitations: palette.markWordFirm, slips: palette.markSlipFirm };
  const kinds = kindAlone ? [kindAlone] : KINDS;
  const chartBars: ChartBar[] = bars.map((b, i) => {
    const lastBar = i === bars.length - 1;
    const v = barValue(b, kindAlone);
    return {
      key: b.key,
      value: v ?? 0,
      parts: b.pages > 0 ? kinds.map((k) => b.kinds[k] / b.pages) : undefined,
      valueText: v !== null && v > 0 ? perPageText(v) : undefined,
      label: barLabel(b, lastBar),
      spoken: barSpoken(b, lastBar, kindAlone),
    };
  });
  const anyTakes = bars.some((b) => b.takes > 0);
  const anyMistakes = chartBars.some((b) => b.value > 0);
  const pickedAt = picked ? bars.findIndex((b) => b.key === picked) : -1;
  const litAt = pickedAt >= 0 ? pickedAt : bars.length - 1;

  const rate = perPage(trend.now);
  const chip = trendChip(trend.now, trend.before);
  const slipping = allPassages ? ins.slipping : ins.slipping.slice(0, 1);
  const total = fixed.fixed + fixed.slipping;

  return (
    <View style={[styles.section, !first && !alone && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.separator }]} testID="insights-recitation">
      {!alone || revo ? (
        <View style={styles.head}>
          {/* Alone on its own page (ACT-35): the top bar names it. */}
          <View style={styles.flex}>
            {alone ? null : (
              <>
                <ChromeText style={[styles.title, { color: palette.text }]} accessibilityRole="header">
                  {t('activity.recitation.title')}
                </ChromeText>
                <ChromeText style={[typeV2.meta, { color: palette.secondary }]}>{t('activity.recitation.detail', { span: inWords })}</ChromeText>
              </>
            )}
          </View>
          {revo ? (
            <Tap
              onPress={() => openRevo({ attach: insightAttachment('recitation') })}
              accessibilityRole="button"
              accessibilityLabel={t('activity.recitation.askRevo')}
              style={[styles.ask, { borderColor: palette.outline }]}
              testID="insights-recitation-ask"
            >
              <Ionicons name="sparkles-outline" size={16} color={palette.accentText} />
              <ChromeText style={[typeV2.name, { color: palette.text }]}>{t('activity.insights.ask')}</ChromeText>
            </Tap>
          ) : null}
        </View>
      ) : null}

      {/* The trend first: mistakes a page in the range, against the period before. */}
      <View testID="insights-recitation-figure">
        {trend.takes > 0 ? (
          <>
            {/* Takes kept without their final answer only (RECITE-11): no rate, the line alone. */}
            {rate !== null ? (
            <View style={styles.hero}>
              <ChromeText style={[styles.big, { color: palette.text }]} numberOfLines={1} testID="insights-recitation-rate">
                {perPageText(rate)}
              </ChromeText>
              <ChromeText style={[styles.unit, { color: palette.secondary }]} numberOfLines={1}>
                {t('reciteInsights.page.unit')}
              </ChromeText>
              {chip ? (
                <View
                  style={[
                    styles.chip,
                    { backgroundColor: chip.dir === 'down' ? palette.goodSubtle : chip.dir === 'up' ? palette.redSubtle : palette.fill },
                  ]}
                  testID={`insights-recitation-trend-${chip.dir}`}
                >
                  {chip.dir !== 'same' ? (
                    <Ionicons name={chip.dir === 'down' ? 'arrow-down' : 'arrow-up'} size={13} color={chip.dir === 'down' ? palette.good : palette.onRedSubtle} />
                  ) : null}
                  <ChromeText
                    style={[typeV2.meta, styles.strong, { color: chip.dir === 'down' ? palette.good : chip.dir === 'up' ? palette.onRedSubtle : palette.secondary }]}
                    numberOfLines={1}
                  >
                    {chip.text}
                  </ChromeText>
                </View>
              ) : null}
            </View>
            ) : null}
            <ChromeText style={[typeV2.meta, styles.heroLine, { color: palette.secondary }]} testID="insights-recitation-line">
              {heroLine(trend.takes, trend.score !== null ? formatAccuracy(trend.score) : null, range.lastWords, chip ? range.before : null)}
            </ChromeText>
          </>
        ) : (
          <ChromeText style={[typeV2.body, styles.heroLine, { color: palette.secondary }]} testID="insights-recitation-line">
            {t('reciteInsights.noTakes', { when: inWords })}
          </ChromeText>
        )}
      </View>

      {/* Mistakes by kind, week by week. */}
      <ChartPills
        options={CHART_SPANS.map((k) => ({ key: k, label: spanLabel(k) }))}
        value={chartSpan}
        onChange={(k) => {
          setChartSpan(k);
          setPicked(null);
        }}
        testID="insights-recitation-span"
      />
      <View style={[styles.card, { backgroundColor: palette.fill }]} testID="insights-recitation-chart">
        <View style={styles.cardHead}>
          <ChromeText style={[typeV2.name, styles.flex, { color: palette.text }]} accessibilityRole="header">
            {chartTitle(chartSpan)}
          </ChromeText>
          <ChromeText style={[typeV2.meta, { color: palette.secondary }]}>{t('reciteInsights.page.aPage')}</ChromeText>
        </View>
        {anyTakes ? (
          <>
            <View style={styles.legend}>
              {KINDS.map((k) => {
                const on = kindAlone === k;
                const dim = kindAlone !== null && !on;
                return (
                  <Tap
                    key={k}
                    onPress={() => setKindAlone(on ? null : k)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    style={[styles.kind, { borderColor: on ? palette.text : palette.outline, opacity: dim ? 0.5 : 1 }]}
                    testID={`insights-recitation-kind-${k}`}
                  >
                    <View style={[styles.dot, { backgroundColor: colours[k] }]} />
                    <ChromeText style={[typeV2.meta, styles.strong, { color: palette.text }]} numberOfLines={1}>
                      {kindName(k)}
                    </ChromeText>
                  </Tap>
                );
              })}
            </View>
            <ChromeText style={[typeV2.name, styles.pick, { color: palette.text }]} testID="insights-recitation-pick">
              {barLine(bars[litAt], litAt === bars.length - 1, kindAlone)}
            </ChromeText>
            {anyMistakes ? (
              <TapChart
                bars={chartBars}
                picked={picked}
                onPick={setPicked}
                colours={kinds.map((k) => colours[k])}
                height={110}
                minSlots={chartBars.length}
                testID="insights-recitation-bars"
              />
            ) : (
              <ChromeText style={[typeV2.meta, styles.clean, { color: palette.secondary }]} testID="insights-recitation-clean">
                {t('reciteInsights.page.allClean')}
              </ChromeText>
            )}
            {anyMistakes ? (
              <ChromeText style={[typeV2.meta, styles.hint, { color: palette.secondary }]}>
                {t(chartSpan === '1y' ? 'reciteInsights.page.hintMonths' : 'reciteInsights.page.hintWeeks')}
              </ChromeText>
            ) : null}
          </>
        ) : (
          <ChromeText style={[typeV2.meta, styles.clean, { color: palette.secondary }]} testID="insights-recitation-no-takes">
            {t('reciteInsights.noTakes', { when: spanIn(chartSpan) })}
          </ChromeText>
        )}
      </View>

      {/* What you've put right, and what still slips. */}
      {total > 0 ? (
        <View testID="insights-recitation-fixed">
          <ChromeText style={[typeV2.meta, styles.caps, { color: palette.secondary }]} accessibilityRole="header">
            {t('reciteInsights.page.fixedHead')}
          </ChromeText>
          <View style={tilesStack(Math.max(formatNumber(fixed.fixed).length, formatNumber(fixed.slipping).length), width, fontScale) ? styles.tilesStacked : styles.tiles}>
            <View style={[styles.tile, { backgroundColor: palette.fill }]} testID="insights-recitation-fixed-tile">
              <ChromeText style={[styles.tileFigure, { color: palette.good }]} numberOfLines={1}>
                {formatNumber(fixed.fixed)}
              </ChromeText>
              <ChromeText style={[typeV2.meta, { color: palette.secondary }]}>{fixedTile(fixed, range.inTheLast)}</ChromeText>
            </View>
            <View style={[styles.tile, { backgroundColor: palette.fill }]} testID="insights-recitation-slipping-tile">
              <ChromeText style={[styles.tileFigure, { color: palette.red }]} numberOfLines={1}>
                {formatNumber(fixed.slipping)}
              </ChromeText>
              <ChromeText style={[typeV2.meta, { color: palette.secondary }]}>{slippingTile(fixed, range.inTheLast)}</ChromeText>
            </View>
          </View>
          <View
            style={[styles.share, { backgroundColor: palette.markWordFirm }]}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            testID="insights-recitation-share"
          >
            <View style={{ flex: fixed.fixed, backgroundColor: palette.good }} />
            <View style={{ flex: fixed.slipping }} />
          </View>
          <ChromeText style={[typeV2.meta, styles.shareLine, { color: palette.secondary }]}>{shareLine(fixed)}</ChromeText>

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
          {ins.slipping.length > 1 || ins.similar.length > 0 || strong.length > 0 ? (
            <Tap
              onPress={() => setAllPassages((v) => !v)}
              accessibilityRole="button"
              style={[styles.row, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.separator }]}
              testID="insights-recitation-see-all"
            >
              <ChromeText style={[typeV2.name, styles.flex, { color: palette.text }]}>
                {allPassages
                  ? t('activity.recitation.showFewer')
                  : t('reciteInsights.page.seeAll', { count: ins.slipping.length, n: formatNumber(ins.slipping.length) })}
              </ChromeText>
              <Ionicons name={allPassages ? 'chevron-up' : forwardIcon()} size={16} color={palette.secondary} />
            </Tap>
          ) : null}
          {allPassages && ins.similar.length > 0 ? (
            <>
              <ChromeText style={[typeV2.name, styles.subHead, { color: palette.text }]} accessibilityRole="header">
                {t('activity.recitation.similarAyahs')}
              </ChromeText>
              {ins.similar.map((s, i) => (
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
          {allPassages && strong.length > 0 ? (
            <>
              <ChromeText style={[typeV2.name, styles.subHead, { color: palette.text }]} accessibilityRole="header">
                {t('activity.recitation.strongButSlips')}
              </ChromeText>
              {strong.map((p, i) => (
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
        </View>
      ) : null}

      {/* How long you usually recite, and whether long takes go better. */}
      {lengths ? (
        <View testID="insights-recitation-takes">
          <ChromeText style={[typeV2.meta, styles.caps, { color: palette.secondary }]} accessibilityRole="header">
            {t('reciteInsights.page.takesHead')}
          </ChromeText>
          <View style={styles.takes}>
            <View style={[styles.icon, { backgroundColor: palette.fill }]}>
              <Ionicons name="stopwatch-outline" size={16} color={palette.secondary} />
            </View>
            <View style={styles.flex}>
              <ChromeText style={[typeV2.name, { color: palette.text }]} testID="insights-recitation-takes-title">
                {takesTitle(lengths)}
              </ChromeText>
              {takesLine(lengths, today) ? (
                <ChromeText style={[typeV2.meta, { color: palette.secondary }]} testID="insights-recitation-takes-line">
                  {takesLine(lengths, today)}
                </ChromeText>
              ) : null}
            </View>
          </View>
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
      accessibilityLabel={t('activity.insights.weakRow', { label: spokenText(title), reason: spokenText(note) })}
      style={[styles.row, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.separator }]}
      testID={testID}
    >
      <View style={styles.flex}>
        <ChromeText style={[typeV2.name, { color: palette.text }]}>{title}</ChromeText>
        <ChromeText style={[typeV2.meta, { color: palette.secondary }]}>{note}</ChromeText>
        {chips}
      </View>
      <Ionicons name={forwardIcon()} size={16} color={palette.secondary} />
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

const styles = StyleSheet.create({
  flex: { flex: 1 },
  // As Insights' other sections (InsightsView's section, sectionHead, sectionTitle, ask).
  section: { paddingTop: 18, paddingBottom: 18, paddingHorizontal: 16 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 6 },
  title: { fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.3 },
  ask: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32, borderRadius: 16, borderWidth: 1, paddingHorizontal: 12 },
  // The hero: the figure, its unit and the trend chip; the chip goes under them when the line is full.
  hero: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 6, rowGap: 6, marginTop: 6 },
  big: { fontSize: PAGE_TYPE.figure, lineHeight: 40, fontWeight: '700', letterSpacing: -0.8, fontVariant: ['tabular-nums'] },
  unit: { fontSize: PAGE_TYPE.unit, lineHeight: 22, fontWeight: '500' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'center' },
  strong: { fontWeight: '600' },
  heroLine: { marginTop: 4 },
  card: { marginTop: 12, borderRadius: 16, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 12 },
  cardHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  kind: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, minHeight: 28, maxWidth: '100%' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  pick: { marginTop: 12 },
  clean: { marginTop: 10 },
  hint: { marginTop: 8, alignSelf: 'flex-end' },
  caps: { marginTop: 22, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: '600' },
  tiles: { flexDirection: 'row', gap: 10 },
  tilesStacked: { flexDirection: 'column', gap: 10 },
  tile: { flex: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, gap: 2 },
  tileFigure: { fontSize: PAGE_TYPE.tileFigure, lineHeight: 34, fontWeight: '700', letterSpacing: -0.6, fontVariant: ['tabular-nums'] },
  share: { flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 12 },
  shareLine: { marginTop: 6, marginBottom: 4 },
  subHead: { marginTop: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  chips: { flexDirection: 'row-reverse', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 6, marginTop: 6 },
  more: { alignSelf: 'center' },
  takes: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  icon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
});
