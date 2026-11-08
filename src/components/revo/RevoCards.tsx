import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { knownChart, passagePagesOf, plannedOf, recencyLine, tableRows } from '../../lib/revo/charts';
import { dayFacts, passageFacts, passagePreview, prepare, type FactSources } from '../../lib/revo/facts';
import { SCREEN_BUTTON } from '../../lib/revo/screens';
import type { RevoAction, RevoVisual } from '../../lib/revo/types';
import { PillButton } from '../v2/PillButton';
import { DailyPagesChart } from './charts/DailyPagesChart';
import { JuzMapChart } from './charts/JuzMapChart';
import { MemorizedChart } from './charts/MemorizedChart';
import { PageRatingsChart } from './charts/PageRatingsChart';
import { TableChart } from './charts/TableChart';
import { TimelineChart } from './charts/TimelineChart';
import { WeeksChart } from './charts/WeeksChart';

/** Where a chart's panel can take the user (RevoChat wires them; RevoHost closes Revo first). */
export interface ChartHandlers {
  onOpenDay?: (day: string) => void;
  onOpenPage?: (page: number) => void;
  /** Puts these pages first in tomorrow's revision (as a reviseFirst plan does). */
  onReviseFirst?: (pages: number[]) => Promise<void>;
}

/**
 * A chart Revo asked for, drawn from this account's own data (lib/revo/charts), flat on the sheet
 * like an Insights section. Each answers a touch: a tap (or a slide along the bars) picks a mark,
 * and a panel under it leads on. A kind this app doesn't know draws nothing.
 */
export function ChartCard({ chart, day, sources, ...handlers }: { chart: RevoVisual; day: string; sources?: () => FactSources | null } & ChartHandlers) {
  const { logs, pages, user } = useApp();
  // Ratings mean something only with Smart Tracking on; off, the charts show recency (REVO-34).
  const smart = user?.smartTrackingEnabled === true;
  // What the plan had for each day, and a day's facts, as Revo's attachments read them.
  const reads = useMemo(() => {
    const src = sources?.() ?? null;
    if (!src) return null;
    const prepared = prepare(src);
    return {
      planned: plannedOf(src),
      facts: (d: string) => dayFacts(d, prepared),
      planPages: (d: string) => (d === src.snapshot.day ? src.snapshot.pages : prepared.scheduled(d)),
      preview: (pages: number[]) => {
        if (pages.length === 0) return null;
        const f = passageFacts(pages, prepared);
        return smart ? passagePreview(f) : recencyLine(f);
      },
      passage: (pages: number[], name: string) => passageFacts(pages, prepared, name),
    };
  }, [sources, smart]);
  const passage = useMemo(() => (chart.kind === 'timeline' && knownChart(chart) ? passagePagesOf(chart) : []), [chart]);
  const rows = useMemo(() => (chart.kind === 'table' && knownChart(chart) && reads ? tableRows(chart, reads.passage) : null), [chart, reads]);
  if (!knownChart(chart)) return null;
  if (chart.kind === 'memorized') {
    return <MemorizedChart title={chart.title} months={chart.months} today={day} onOpenDay={handlers.onOpenDay} />;
  }
  if (chart.kind === 'juzMap') {
    return (
      <JuzMapChart
        title={chart.title}
        today={day}
        logs={logs}
        userPages={pages}
        preview={reads?.preview}
        smart={smart}
        onReviseFirst={handlers.onReviseFirst}
        onOpenPage={handlers.onOpenPage}
      />
    );
  }
  if (chart.kind === 'timeline') {
    return <TimelineChart title={chart.title} passage={passage} days={chart.days} today={day} logs={logs} smart={smart} onOpenDay={handlers.onOpenDay} />;
  }
  if (chart.kind === 'table') {
    // Its figures are what Revo's attachments say for each row: without the account's facts, no table.
    if (!rows) return null;
    return (
      <TableChart
        title={chart.title}
        rows={rows}
        columns={chart.columns}
        byJuz={chart.juz != null}
        smart={smart}
        userPages={pages}
        onReviseFirst={handlers.onReviseFirst}
        onOpenPage={handlers.onOpenPage}
      />
    );
  }
  if (chart.kind === 'weeks') {
    return <WeeksChart title={chart.title} weeks={chart.weeks} today={day} logs={logs} facts={reads?.facts} planned={reads?.planned} onOpenDay={handlers.onOpenDay} />;
  }
  if (chart.kind === 'pageRatings') {
    // Ratings over time: nothing to show without Smart Tracking (REVO-34).
    if (!smart) return null;
    return <PageRatingsChart title={chart.title} pages={chart.pages} today={day} logs={logs} userPages={pages} onReviseFirst={handlers.onReviseFirst} onOpenPage={handlers.onOpenPage} />;
  }
  return (
    <DailyPagesChart
      title={chart.title}
      days={chart.days}
      today={day}
      logs={logs}
      planned={reads?.planned}
      facts={reads?.facts}
      planPages={reads?.planPages}
      smart={smart}
      onOpenDay={handlers.onOpenDay}
    />
  );
}

const ACTION_BUTTON: Record<Exclude<RevoAction['kind'], 'openScreen'>, string> = {
  reviseFirst: 'Add to my plan',
  openPage: 'Open in the reader',
  startRevision: 'Start revision',
};

/** The card's button: for a screen, what it opens (lib/revo/screens). */
const actionButton = (a: RevoAction) => (a.kind === 'openScreen' ? SCREEN_BUTTON[a.screen] : ACTION_BUTTON[a.kind]);

const ACTION_ICON: Record<RevoAction['kind'], keyof typeof Ionicons.glyphMap> = {
  reviseFirst: 'calendar-outline',
  openPage: 'book-outline',
  startRevision: 'play-circle-outline',
  openScreen: 'arrow-forward-circle-outline',
};

/** The one thing Revo suggests: nothing changes until the user taps it. */
export function PlanCard({
  action,
  state,
  onDo,
  onDismiss,
}: {
  action: RevoAction;
  state?: 'added' | 'dismissed';
  onDo: () => void;
  onDismiss: () => void;
}) {
  const { palette } = useTheme();
  return (
    <View style={[styles.plan, { borderColor: palette.outline }]} testID="revo-plan">
      <View style={styles.planHead}>
        <Ionicons name={ACTION_ICON[action.kind]} size={22} color={palette.text} />
        <Text style={[styles.planTitle, { color: palette.text }]} maxFontSizeMultiplier={1.3}>
          {action.title}
        </Text>
      </View>
      {action.detail ? (
        <Text style={[styles.planDetail, { color: palette.secondary }]} maxFontSizeMultiplier={1.4}>
          {action.detail}
        </Text>
      ) : null}
      {state === 'added' ? (
        <View style={styles.planDone} testID="revo-plan-added">
          <Ionicons name="checkmark-circle" size={18} color={palette.doneText} />
          <Text style={[styles.planDetail, { color: palette.text }]}>
            {action.kind === 'reviseFirst' ? 'Added to tomorrow’s revision' : 'Done'}
          </Text>
        </View>
      ) : state === 'dismissed' ? null : (
        <View style={styles.planButtons}>
          <PillButton title={actionButton(action)} onPress={onDo} size="sm" testID="revo-plan-do" style={styles.planPrimary} />
          <PillButton title="Not now" onPress={onDismiss} size="sm" variant="outline" testID="revo-plan-not-now" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  plan: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 6 },
  planHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  planTitle: { fontSize: 17, fontWeight: '600', flexShrink: 1 },
  planDetail: { fontSize: 14, lineHeight: 19 },
  planButtons: { flexDirection: 'row', gap: 10, marginTop: 8 },
  planPrimary: { minHeight: 34 },
  planDone: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
});
