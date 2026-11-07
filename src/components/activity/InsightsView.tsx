// Activity's Insights (gap audit §5, mock d4): Coverage, Consistency, Weak spots, Memorization and Pace,
// each a section with a title, one detail line, a figure and its picture, and no captions. The figures
// come from lib/insightsView (definitions: ACT-4).

import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { Tap } from '../v2/Tap';
import { PillTabs } from '../v2/PillTabs';
import { typeV2 } from '../../theme/v2';
import { lastRevisedByPage } from '../../lib/activityInsights';
import {
  busiestHours,
  coverageCount,
  formatPace,
  juzTiles,
  memorizationMonths,
  minutesByHour,
  monthCount,
  monthLabel,
  monthName,
  paceView,
  quranShare,
  reportMonth,
  reviseFirstLabel,
  untouchedJuz,
  weakSpotRows,
  weekCircles,
  type JuzTile,
} from '../../lib/insightsView';
import { getPagesForJuz } from '../../lib/quranData';
import { openRevo } from '../../lib/revo/open';
import { spokenText } from '../../lib/passages';

type Window = '7' | '30';

export interface InsightsData {
  today: string;
  memorized: Set<number>;
  learning: Set<number>;
  rating: (page: number) => number | undefined;
  /** Times each page was rated weak in 30 days (lib/insightsView ratedWeakCounts). */
  ratedWeak: Map<number, number>;
  revised: { day: string; countsFor: string; pages: number[]; skipped: number[]; minutes: number | null; occurredAt: number | null }[];
  read: { day: string; pages: number[]; minutes: number | null; occurredAt: number | null }[];
  /** Twelve months of memorization items. */
  memorizations: { day: string; pages: number[] }[];
  /** The plan's pages a day (Pace's "A 20-page day"). */
  capacity: number;
  /** Revo's Ask on Weak spots (REVO-1: testers who can use Revo). */
  revo: boolean;
  /** Smart Tracking: without it no page is rated, so Weak spots is hidden (ACT-12). Unset counts as on. */
  smartTracking?: boolean;
}

export function InsightsView({
  data,
  onReviseTomorrow,
  onPlanIt,
  onOpenPage,
  onSeeAllPages,
  onTurnOnSmartTracking,
}: {
  data: InsightsData;
  onReviseTomorrow: (pages: number[]) => void;
  onPlanIt: (pages: number[]) => void;
  onOpenPage: (page: number) => void;
  /** Weak spots' "See all pages by strength": every revised page, weakest first (ACT-12). */
  onSeeAllPages?: () => void;
  /** Smart Tracking off: the line in Weak spots' place, to Settings at its switch (ACT-12). */
  onTurnOnSmartTracking?: () => void;
}) {
  return (
    <View testID="activity-insights">
      <Coverage data={data} onPlanIt={onPlanIt} />
      <Consistency data={data} />
      {data.smartTracking !== false ? (
        <WeakSpots data={data} onReviseTomorrow={onReviseTomorrow} onOpenPage={onOpenPage} onSeeAllPages={onSeeAllPages} />
      ) : onTurnOnSmartTracking ? (
        <SmartTrackingInvite onPress={onTurnOnSmartTracking} />
      ) : null}
      <Memorization data={data} />
      <Pace data={data} />
    </View>
  );
}

function Section({
  title,
  detail,
  right,
  children,
  first,
  testID,
}: {
  title: string;
  detail: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  first?: boolean;
  testID?: string;
}) {
  const { palette } = useTheme();
  return (
    <View style={[styles.section, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.separator }]} testID={testID}>
      <View style={styles.sectionHead}>
        <View style={styles.flex}>
          <Text style={[styles.sectionTitle, { color: palette.text }]} accessibilityRole="header">
            {title}
          </Text>
          <Text style={[typeV2.meta, { color: palette.secondary }]}>{detail}</Text>
        </View>
        {right}
      </View>
      {children}
    </View>
  );
}

/** The big number and its inline words, on one baseline ("87%  265 of 305 …"). */
function Figure({ value, text, right }: { value: string; text: string; right?: React.ReactNode }) {
  const { palette } = useTheme();
  return (
    <View style={styles.figure}>
      <Text style={[styles.big, { color: palette.text }]}>{value}</Text>
      <Text style={[typeV2.body, styles.flex, { color: palette.secondary }]}>{text}</Text>
      {right}
    </View>
  );
}

// ── Coverage ─────────────────────────────────────────────────────────────

function Coverage({ data, onPlanIt }: { data: InsightsData; onPlanIt: (pages: number[]) => void }) {
  const { palette } = useTheme();
  const [window, setWindow] = useState<Window>('30');
  const last = useMemo(() => lastRevisedByPage(data.revised, data.today), [data.revised, data.today]);
  const tiles = useMemo(() => juzTiles(data.memorized, data.learning, last, data.today), [data.memorized, data.learning, last, data.today]);
  const days = Number(window);
  const count = coverageCount(data.memorized, last, data.today, days);
  const pct = count.of > 0 ? Math.round((count.revised / count.of) * 100) : 0;
  const untouched = untouchedJuz(tiles);
  const tile = (t: JuzTile) => {
    const look =
      t.state === 'week'
        ? { backgroundColor: palette.heat[3], color: palette.heatInk[3] }
        : t.state === 'month'
          ? { backgroundColor: palette.heat[1], color: palette.heatInk[1] }
          : t.state === 'stale'
            ? { borderWidth: 1.5, borderColor: palette.red, color: palette.red }
            : { backgroundColor: palette.heat[0], color: palette.secondary, dim: true };
    const label =
      t.state === 'none'
        ? `Juz ${t.juz}, not memorized${t.learning ? ', learning' : ''}`
        : t.state === 'stale'
          ? `Juz ${t.juz}, ${t.daysSince == null ? 'never revised' : `revised ${t.daysSince} days ago`}`
          : `Juz ${t.juz}, revised this ${t.state}`;
    return (
      <View
        key={t.juz}
        style={[styles.tile, look.backgroundColor ? { backgroundColor: look.backgroundColor } : null, look.borderWidth ? { borderWidth: look.borderWidth, borderColor: look.borderColor } : null]}
        accessible
        accessibilityLabel={label}
        testID={`juz-tile-${t.juz}`}
      >
        <Text style={[styles.tileText, { color: look.color, opacity: 'dim' in look ? 0.7 : 1 }]}>{t.juz}</Text>
        {t.learning ? <View style={[styles.learnDot, { backgroundColor: palette.primary }]} /> : null}
      </View>
    );
  };
  const legend: { key: string; label: string; swatch: object }[] = [
    { key: 'week', label: 'This week', swatch: { backgroundColor: palette.heat[3] } },
    { key: 'month', label: 'This month', swatch: { backgroundColor: palette.heat[1] } },
    { key: 'stale', label: '30+ days', swatch: { borderWidth: 1.5, borderColor: palette.red } },
    { key: 'none', label: 'Not memorized', swatch: { backgroundColor: palette.heat[0] } },
  ];

  return (
    <Section
      first
      title="Coverage"
      detail="Which juz you've revised lately"
      right={
        <PillTabs<Window>
          options={[
            { value: '7', label: '7 days' },
            { value: '30', label: '30 days' },
          ]}
          value={window}
          onChange={setWindow}
          tone="ink"
          hug
          compact
          testID="coverage-window"
        />
      }
      testID="insights-coverage"
    >
      <Figure value={`${pct}%`} text={`${count.revised} of ${count.of} memorized pages in ${days} days`} />
      <View style={styles.tiles}>
        {[0, 1, 2].map((row) => (
          <View key={row} style={styles.tileRow}>
            {tiles.slice(row * 10, row * 10 + 10).map(tile)}
          </View>
        ))}
      </View>
      <View style={styles.legend}>
        {legend.map((l) => (
          <View key={l.key} style={styles.legendItem}>
            <View style={[styles.swatch, l.swatch]} />
            <Text style={[typeV2.meta, styles.legendText, { color: palette.secondary }]} numberOfLines={1}>
              {l.label}
            </Text>
          </View>
        ))}
      </View>
      {untouched ? (
        <View style={[styles.untouched, { backgroundColor: palette.bubble }]} testID="insights-untouched">
          <View style={[styles.dot8, { backgroundColor: palette.red }]} />
          <View style={styles.flex}>
            <Text style={[typeV2.name, { color: palette.text }]}>{`Juz ${untouched.first.juz}, untouched the longest`}</Text>
            <Text style={[typeV2.meta, { color: palette.secondary }]}>
              {[
                untouched.first.daysSince == null ? 'Never revised' : `Last revised ${untouched.first.daysSince} days ago`,
                untouched.next ? `Juz ${untouched.next.juz}, ${untouched.next.daysSince == null ? 'never' : `${untouched.next.daysSince} days`}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
          <Tap
            onPress={() => onPlanIt(getPagesForJuz(untouched.first.juz).filter((p) => data.memorized.has(p)))}
            accessibilityRole="button"
            accessibilityLabel={`Plan Juz ${untouched.first.juz}`}
            hitSlop={10}
            testID="insights-plan-it"
          >
            <Text style={[typeV2.name, { color: palette.link }]}>Plan it</Text>
          </Tap>
        </View>
      ) : null}
    </Section>
  );
}

// ── Consistency ──────────────────────────────────────────────────────────

function Consistency({ data }: { data: InsightsData }) {
  const { palette } = useTheme();
  // ACT-4: a day counts with a revision or a read.
  const active = useMemo(() => new Set([...data.revised.map((r) => r.day), ...data.read.map((r) => r.day)]), [data.revised, data.read]);
  const week = weekCircles(active, data.today);
  const month = reportMonth(data.today);
  const m = monthCount(active, month, data.today);
  const hours = useMemo(() => minutesByHour([...data.revised, ...data.read], data.today, 30), [data.revised, data.read, data.today]);
  const busiest = busiestHours(hours);
  const max = Math.max(1, ...hours);

  return (
    <Section title="Consistency" detail="How often, and when" testID="insights-consistency">
      <Figure value={String(week.filter((d) => d.done).length)} text={`of the last 7 days · ${m.done} of ${m.of} in ${monthName(month)}`} />
      <View style={styles.circles}>
        {week.map((d) => (
          <View key={d.day} style={styles.circleCol} accessible accessibilityLabel={`${d.day}, ${d.done ? 'revised or read' : 'missed'}`}>
            <View style={[styles.circle, d.done ? { backgroundColor: palette.primary } : { borderWidth: 1.5, borderColor: palette.outline }]}>
              {d.done ? <Ionicons name="checkmark" size={16} color={palette.onPrimary} /> : null}
            </View>
            <Text style={[typeV2.meta, styles.letter, { color: palette.secondary }]}>{d.letter}</Text>
          </View>
        ))}
      </View>
      {busiest ? (
        <View style={styles.hoursBlock} testID="insights-hours">
          <Text style={[typeV2.name, { color: palette.text }]}>{busiest}</Text>
          <Text style={[typeV2.meta, { color: palette.secondary }]}>Minutes by hour, last 30 days</Text>
          <View style={styles.hourBars}>
            {hours.map((v, h) => (
              <View
                key={h}
                style={[
                  styles.hourBar,
                  v > 0
                    ? { height: Math.max(3, Math.round((60 * v) / max)), backgroundColor: palette.primary, opacity: v >= 20 ? 1 : 0.45 }
                    : { height: 3, backgroundColor: palette.track },
                ]}
              />
            ))}
          </View>
          <View style={styles.hourLabels}>
            {[0, 6, 12, 18].map((h) => (
              <Text key={h} style={[typeV2.meta, styles.hourLabel, { color: palette.secondary, left: `${(h / 24) * 100}%` }]}>
                {h === 0 ? '12 AM' : h === 6 ? '6 AM' : h === 12 ? '12 PM' : '6 PM'}
              </Text>
            ))}
          </View>
        </View>
      ) : null}
    </Section>
  );
}

// ── Weak spots ───────────────────────────────────────────────────────────

/** Links in Insights are chrome: their text stops growing at 1.4× (Dynamic Type). */
const LINK_MAX_SCALE = 1.4;
const INVITE = 'Turn on Smart Tracking to see your weak spots';

/**
 * Smart Tracking off: no page is rated, so Weak spots gives way to one line that turns it on
 * (Settings → Revision, at its switch). A label, not a guide (ACT-12).
 */
function SmartTrackingInvite({ onPress }: { onPress: () => void }) {
  const { palette } = useTheme();
  return (
    <View style={[styles.section, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.separator }]}>
      <Tap onPress={onPress} accessibilityRole="link" accessibilityLabel={INVITE} hitSlop={8} style={styles.invite} testID="insights-smart-tracking">
        <Text style={[typeV2.name, styles.linkText, { color: palette.link }]} maxFontSizeMultiplier={LINK_MAX_SCALE}>
          {INVITE}
        </Text>
        <Ionicons name="chevron-forward" size={16} color={palette.link} />
      </Tap>
    </View>
  );
}

function WeakSpots({
  data,
  onReviseTomorrow,
  onOpenPage,
  onSeeAllPages,
}: {
  data: InsightsData;
  onReviseTomorrow: (pages: number[]) => void;
  onOpenPage: (page: number) => void;
  onSeeAllPages?: () => void;
}) {
  const { palette } = useTheme();
  const rows = weakSpotRows({
    memorized: data.memorized,
    rating: data.rating,
    ratedWeak: data.ratedWeak,
    revisions: data.revised.filter((r) => r.day === r.countsFor),
    today: data.today,
  });
  const pages = rows.flatMap((r) => r.pages);
  return (
    <Section
      title="Weak spots"
      detail="Weak now, or skipped most in 30 days"
      right={
        data.revo ? (
          <Tap
            onPress={() => openRevo({ attach: { kind: 'insight', label: 'Weak spots', insight: 'weakSpots' } })}
            accessibilityRole="button"
            accessibilityLabel="Ask Revo about your weak spots"
            style={[styles.ask, { borderColor: palette.outline }]}
            testID="insights-ask-revo"
          >
            <Ionicons name="sparkles-outline" size={16} color={palette.accentText} />
            <Text style={[typeV2.name, { color: palette.text }]}>Ask</Text>
          </Tap>
        ) : undefined
      }
      testID="insights-weak-spots"
    >
      {rows.length === 0 ? (
        <Text style={[typeV2.body, styles.none, { color: palette.secondary }]}>Nothing weak or often skipped</Text>
      ) : (
        <View style={styles.weakList}>
          {rows.map((r, i) => (
            <Tap
              key={r.label}
              onPress={() => onOpenPage(r.pages[0])}
              accessibilityRole="button"
              accessibilityLabel={`${spokenText(r.label)}. ${r.reason}. Open it`}
              style={[styles.weakRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.separator }]}
              testID={`weak-spot-${r.pages[0]}`}
            >
              <View style={[styles.dot8, { backgroundColor: palette.red }]} />
              <View style={styles.flex}>
                {/* The surah and ayahs first; the page only as a quiet detail (Majd, Nov 7 2026). */}
                <Text numberOfLines={1}>
                  <Text style={[typeV2.name, { color: palette.text }]}>{r.label}</Text>
                  <Text style={[typeV2.body, { color: palette.secondary }]}>{`  ${r.pagesNote}`}</Text>
                </Text>
                <Text style={[typeV2.meta, { color: palette.secondary }]}>{r.reason}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={palette.secondary} />
            </Tap>
          ))}
        </View>
      )}
      {rows.length > 0 ? (
        <Tap
          onPress={() => onReviseTomorrow(pages)}
          accessibilityRole="button"
          style={[styles.outlinePill, { borderColor: palette.outline }]}
          testID="insights-revise-tomorrow"
        >
          <Text style={[typeV2.name, { color: palette.text }]}>{reviseFirstLabel(rows)}</Text>
        </Tap>
      ) : null}
      {onSeeAllPages ? (
        <Tap
          onPress={onSeeAllPages}
          accessibilityRole="button"
          hitSlop={8}
          style={styles.seeAll}
          testID="insights-see-all-pages"
        >
          <Text style={[typeV2.name, styles.linkText, { color: palette.link }]} maxFontSizeMultiplier={LINK_MAX_SCALE}>
            See all pages by strength
          </Text>
          <Ionicons name="chevron-forward" size={16} color={palette.link} />
        </Tap>
      ) : null}
    </Section>
  );
}

// ── Memorization ─────────────────────────────────────────────────────────

function Memorization({ data }: { data: InsightsData }) {
  const { palette } = useTheme();
  const month = reportMonth(data.today);
  const months = useMemo(() => memorizationMonths(data.memorizations, month), [data.memorizations, month]);
  const thisMonth = months[months.length - 1].pages;
  const top = Math.max(10, ...months.map((m) => m.pages));
  const share = quranShare(data.memorized.size);
  return (
    <Section title="Memorization" detail="Pages memorized each month" testID="insights-memorization">
      <Figure
        value={String(data.memorized.size)}
        text={[data.memorized.size === 1 ? 'page' : 'pages', share].filter(Boolean).join(' · ')}
        right={thisMonth > 0 ? <Text style={[typeV2.name, { color: palette.good }]}>{`+${thisMonth} in ${monthName(month)}`}</Text> : undefined}
      />
      <View style={styles.monthBars}>
        {months.map((m, i) => {
          const last = i === months.length - 1;
          return (
            <View key={m.month} style={styles.monthCol} accessible accessibilityLabel={`${monthName(m.month)}, ${m.pages} pages`}>
              {last && m.pages > 0 ? <Text style={[typeV2.meta, styles.monthValue, { color: palette.text }]}>{m.pages}</Text> : null}
              <View style={[styles.monthBar, { height: Math.round((72 * m.pages) / top), backgroundColor: palette.primary, opacity: last ? 1 : 0.4 }]} />
            </View>
          );
        })}
      </View>
      <View style={styles.monthLabels}>
        {months.map((m, i) => (
          <Text key={m.month} style={[typeV2.meta, styles.monthLabel, { color: palette.secondary }]}>
            {monthLabel(m.month, i === 0 || i === months.length - 1)}
          </Text>
        ))}
      </View>
    </Section>
  );
}

// ── Pace ─────────────────────────────────────────────────────────────────

function Pace({ data }: { data: InsightsData }) {
  const { palette } = useTheme();
  const p = paceView({ revised: data.revised.filter((r) => r.day === r.countsFor), read: data.read, today: data.today, capacity: data.capacity });
  // Hidden under ten items with minutes (ACT-4).
  if (!p) return null;
  const change =
    p.before == null
      ? null
      : Math.abs(p.perPage - p.before) < 0.05
        ? 'The same as the month before'
        : `${p.perPage < p.before ? 'Down' : 'Up'} from ${formatPace(p.before)} the month before`;
  return (
    <Section title="Pace" detail="Minutes per page" testID="insights-pace">
      <View style={styles.paceTiles}>
        <View style={[styles.paceTile, { backgroundColor: palette.bubble }]}>
          <View style={styles.paceFigure}>
            <Text style={[styles.paceNumber, { color: palette.text }]}>{formatPace(p.perPage)}</Text>
            <Text style={[typeV2.meta, { color: palette.secondary }]}>min a page</Text>
          </View>
          <Text style={[typeV2.meta, styles.paceText, { color: palette.secondary }]}>{['Revising, last 30 days.', change].filter(Boolean).join(' ')}</Text>
        </View>
        <View style={[styles.paceTile, { backgroundColor: palette.bubble }]}>
          <View style={styles.paceFigure}>
            <Text style={[styles.paceNumber, { color: palette.text }]}>{p.dayMinutes}</Text>
            <Text style={[typeV2.meta, { color: palette.secondary }]}>min</Text>
          </View>
          <Text style={[typeV2.meta, styles.paceText, { color: palette.secondary }]}>{`A ${p.capacity}-page day at that pace`}</Text>
        </View>
      </View>
      <Text style={[typeV2.meta, styles.footnote, { color: palette.secondary }]}>
        {[`From ${p.revisions} ${p.revisions === 1 ? 'revision' : 'revisions'} with their time.`, p.readingPerPage != null ? `Reading: ${formatPace(p.readingPerPage)} min a page.` : null]
          .filter(Boolean)
          .join(' ')}
      </Text>
    </Section>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  section: { paddingTop: 18, paddingBottom: 18, paddingHorizontal: 16 },
  sectionHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  sectionTitle: { fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.3 },
  figure: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 12 },
  big: { fontSize: 28, lineHeight: 32, fontWeight: '700', letterSpacing: -0.6, fontVariant: ['tabular-nums'] },
  tiles: { marginTop: 14, gap: 4 },
  tileRow: { flexDirection: 'row', gap: 4 },
  tile: { flex: 1, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  tileText: { fontSize: 13, lineHeight: 18, fontWeight: '600', fontVariant: ['tabular-nums'] },
  learnDot: { position: 'absolute', top: 4, right: 4, width: 5, height: 5, borderRadius: 2.5 },
  // One line across the tiles' width, as the mock (iOS draws 13pt a little wider than the mock did,
  // so the gaps give way first); a narrow phone or large text wraps it.
  legend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', columnGap: 6, rowGap: 4, marginTop: 10 },
  legendText: { letterSpacing: -0.08 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  untouched: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, marginTop: 14 },
  dot8: { width: 8, height: 8, borderRadius: 4 },
  circles: { flexDirection: 'row', marginTop: 12 },
  circleCol: { flex: 1, alignItems: 'center' },
  circle: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  letter: { marginTop: 5 },
  hoursBlock: { marginTop: 20 },
  hourBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 60, marginTop: 12 },
  hourBar: { flex: 1, borderRadius: 2 },
  hourLabels: { height: 18, marginTop: 6 },
  hourLabel: { position: 'absolute', top: 0 },
  ask: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, borderRadius: 16, borderWidth: 1, paddingHorizontal: 12 },
  none: { marginTop: 12 },
  weakList: { marginTop: 4 },
  weakRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', marginTop: 14 },
  invite: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start' },
  linkText: { flexShrink: 1 },
  outlinePill: { alignSelf: 'flex-start', height: 36, borderRadius: 18, borderWidth: 1, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  monthBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 72 + 21, marginTop: 10 },
  monthCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  monthValue: { fontWeight: '600', marginBottom: 3 },
  monthBar: { alignSelf: 'stretch', borderRadius: 5 },
  monthLabels: { flexDirection: 'row', gap: 6, marginTop: 6 },
  monthLabel: { flex: 1, textAlign: 'center' },
  paceTiles: { flexDirection: 'row', gap: 8, marginTop: 12 },
  paceTile: { flex: 1, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14 },
  paceFigure: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  paceNumber: { fontSize: 22, lineHeight: 26, fontWeight: '700', fontVariant: ['tabular-nums'] },
  paceText: { marginTop: 4 },
  footnote: { marginTop: 10 },
});
