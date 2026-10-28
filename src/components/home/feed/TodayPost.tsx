import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../../context/ThemeContext';
import { computeMemorizationStats, formatFractional } from '../../../lib/memorizationStats';
import type { HomeMetric } from '../../../lib/homePrefs';
import { describePageRuns, describeSurahRuns, pageRuns } from '../../../lib/pageRanges';
import type { UserPage } from '../../../types';
import { typeV2 } from '../../../theme/v2';
import { ActionSheet, SheetAction } from '../../v2/ActionSheet';
import { Mark } from '../../v2/Mark';
import { ProgressRing } from '../../v2/ProgressRing';
import { ProgressHairline } from '../../v2/ProgressHairline';
import { JuzDots } from '../../v2/JuzDots';
import type { ProgressStyle } from '../../../lib/homePrefs';
import { PillButton } from '../../v2/PillButton';
import { RowText, ThreadRow } from '../../v2/ThreadRow';
import { Tap } from '../../v2/Tap';

export type TodayStatus = 'not_started' | 'partial' | 'completed';

const count = (n: number) => `${n} page${n === 1 ? '' : 's'}`;

/** "27% of the Quran" ("<1%" for a page or two). */
export function percentOfQuran(fraction: number): string {
  const percent = fraction * 100;
  return `${percent < 1 && percent > 0 ? '<1' : Math.round(percent)}% of the Quran`;
}

/** "6.2 of 30 juz · 123 of 604 pages", in the order Settings → Home screen chose. */
export function memorizedText(pages: UserPage[], metrics: HomeMetric[]) {
  const stats = computeMemorizationStats(pages);
  const fraction = stats.pages / 604;
  const parts: Record<HomeMetric, string> = {
    juz: `${formatFractional(stats.fractionalJuz)} of 30 juz`,
    pages: `${stats.pages} of 604 pages`,
    surahs: `${stats.surahs} of 114 surahs`,
  };
  const shown = (metrics.length > 0 ? metrics : (['juz', 'pages'] as HomeMetric[])).map((m) => parts[m]);
  return {
    body: shown.join(' · '),
    meta: percentOfQuran(fraction),
    /** Of the 604 pages: the ring around Today's mark (or the hairline). */
    fraction,
    /** Each juz's memorized share, juz 1 first (the juz dots). */
    juz: stats.juzFractions,
  };
}

/** "Juz 26", "Juz 26–27", "Juz 3, 7", or "5 juz". */
export function juzLabel(juzBreakdown: { juz: number }[]): string {
  const js = [...new Set(juzBreakdown.map((j) => j.juz))].sort((a, b) => a - b);
  if (js.length === 0) return '';
  if (js.length === 1) return `Juz ${js[0]}`;
  if (js.every((j, i) => i === 0 || j === js[i - 1] + 1)) return `Juz ${js[0]}–${js[js.length - 1]}`;
  return js.length <= 3 ? `Juz ${js.join(', ')}` : `${js.length} juz`;
}

/** What today's post says, from today's pages, the juz they're in and those done. */
export function todayText(
  status: TodayStatus,
  pages: number[],
  done: ReadonlySet<number>,
  juzBreakdown: { juz: number }[] = [],
) {
  const runs = pageRuns(pages);
  const total = runs.reduce((n, r) => n + r.last - r.first + 1, 0);
  if (total === 0) {
    return {
      title: 'Nothing to revise yet',
      detail: "Start by marking what you've memorized. Most people begin with Juz 30.",
      cta: 'Mark memorized pages',
      solid: true,
    };
  }
  const where = [juzLabel(juzBreakdown), describeSurahRuns(runs)].filter(Boolean).join(' · ');
  if (status === 'completed') {
    return { title: 'Done for today', detail: `${count(Math.max(done.size, total))} revised · ${where}`, cta: 'Review session', solid: false };
  }
  if (status === 'partial') {
    const doneHere = pages.filter((p) => done.has(p)).length;
    return { title: describePageRuns(runs), detail: `${doneHere} of ${total} done · ${where}`, cta: 'Continue revision', solid: true };
  }
  return { title: describePageRuns(runs), detail: `${count(total)} · ${where}`, cta: 'Start revision', solid: true };
}

/**
 * Today on Home, in one post: today's pages, the juz and surahs they cover,
 * the one action (start, continue, review), and under it how much is
 * memorized (opens Memorization). The ⋯ holds the schedule actions.
 */
export function TodayPost({
  name,
  initial,
  status,
  pages,
  juzBreakdown,
  done,
  streak,
  memorized,
  memorizedFraction,
  memorizedJuz,
  progressStyle = 'ring',
  onPrimary,
  onEditSchedule,
  onMemorization,
  leftovers,
  onCarryOver,
  carrying,
  onPushBack,
  canPushBack,
  shifting,
}: {
  name: string;
  initial: string;
  status: TodayStatus;
  pages: number[];
  juzBreakdown: { juz: number; pages: number[] }[];
  done: ReadonlySet<number>;
  streak: number;
  /** "8.1 of 30 juz · 166 of 604 pages" (Settings → Home screen), or null to leave it out. */
  memorized: string | null;
  /** How much of the Quran is memorized (0–1): a ring around the mark, shown with `memorized`. */
  memorizedFraction?: number;
  /** Each juz's memorized share, juz 1 first: for the juz dots. */
  memorizedJuz?: number[];
  /** How the amount shows (a tester-only choice for now; the ring by default). */
  progressStyle?: ProgressStyle;
  onPrimary: () => void;
  onEditSchedule: () => void;
  onMemorization: () => void;
  leftovers: number;
  onCarryOver: () => void;
  carrying: boolean;
  onPushBack: () => void;
  /** There's a day before today to go back to (not on a schedule that starts today). */
  canPushBack: boolean;
  shifting: boolean;
}) {
  const { palette } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const text = todayText(status, pages, done, juzBreakdown);
  const empty = pages.length === 0;
  const meta = streak > 0 ? `Today · ${streak}-day streak` : 'Today';
  // How much is memorized, in the chosen style; only with the Memorized line.
  const progress = memorized != null && memorizedFraction != null ? memorizedFraction : null;
  const progressLabel = progress != null ? `Memorized ${percentOfQuran(progress)}` : '';

  const actions: SheetAction[] = [
    { key: 'schedule', label: 'Edit schedule', icon: 'calendar-outline', onPress: onEditSchedule },
    ...(status !== 'completed' && !empty && canPushBack
      ? [
          {
            key: 'pushback',
            label: shifting ? 'Updating…' : 'Behind? Move the plan back a day',
            icon: 'arrow-undo-outline' as const,
            disabled: shifting,
            onPress: onPushBack,
          },
        ]
      : []),
    { key: 'memorized', label: 'Memorized pages', icon: 'book-outline', onPress: onMemorization },
  ];

  return (
    <View testID="today-thread">
      <ThreadRow
        mark={
          progress != null && progressStyle === 'ring' ? (
            <ProgressRing progress={progress} label={progressLabel} testID="today-ring">
              <Mark label={initial} />
            </ProgressRing>
          ) : (
            <Mark label={initial} />
          )
        }
        name={name || 'Today'}
        meta={name ? meta : undefined}
        onMenu={() => setMenuOpen(true)}
        menuLabel="Today's options"
        testID="today-post"
        footer={
          <>
            <PillButton
              title={text.cta}
              onPress={onPrimary}
              variant={text.solid ? 'solid' : 'outline'}
              testID="today-cta"
            />
            {leftovers > 0 ? (
              <PillButton
                title={carrying ? 'Adding…' : `Add ${leftovers} from yesterday`}
                variant="outline"
                onPress={onCarryOver}
                disabled={carrying}
                accessibilityLabel={`Add ${leftovers} unrevised pages from yesterday to today`}
                testID="today-carry-over"
              />
            ) : null}
            {memorized ? (
              <Tap
                onPress={onMemorization}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={`Memorized ${memorized}. Open memorization`}
                style={styles.memorized}
                testID="today-memorized"
              >
                <Text style={[typeV2.meta, { color: palette.secondary }]} numberOfLines={1}>
                  {`Memorized ${memorized}`}
                </Text>
              </Tap>
            ) : null}
            {progress != null && progressStyle === 'hairline' ? (
              <ProgressHairline progress={progress} label={progressLabel} testID="today-hairline" />
            ) : null}
            {progress != null && progressStyle === 'dots' ? (
              <JuzDots juz={memorizedJuz ?? []} progress={progress} label={progressLabel} testID="today-dots" />
            ) : null}
          </>
        }
      >
        <View style={styles.titleRow}>
          {status === 'completed' ? (
            <View style={[styles.dot, { backgroundColor: palette.done }]} accessibilityElementsHidden />
          ) : null}
          <RowText>{text.title}</RowText>
        </View>
        <RowText secondary>{text.detail}</RowText>
      </ThreadRow>

      <ActionSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        title="Today"
        actions={actions}
        testID="today-menu"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  memorized: { width: '100%', marginTop: 4 },
});
