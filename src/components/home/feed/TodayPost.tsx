import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../context/ThemeContext';
import { computeMemorizationStats } from '../../../lib/memorizationStats';
import { describePageRuns, describeSurahRuns, pageRuns } from '../../../lib/pageRanges';
import type { UserPage } from '../../../types';
import { typeV2 } from '../../../theme/v2';
import { ActionSheet, SheetAction } from '../../v2/ActionSheet';
import { Mark } from '../../v2/Mark';
import { JuzDots } from '../../v2/JuzDots';
import { PillButton } from '../../v2/PillButton';
import { RowText, ThreadRow } from '../../v2/ThreadRow';
import { Tap } from '../../v2/Tap';

export type TodayStatus = 'not_started' | 'partial' | 'completed';

const count = (n: number) => `${n} page${n === 1 ? '' : 's'}`;

/** "17.9%": of the 604 pages, to one decimal ("0%", "100%" at the ends). */
export function formatPercent(fraction: number): string {
  const percent = Math.round(fraction * 1000) / 10;
  if (percent <= 0) return '0%';
  if (percent >= 100) return '100%';
  return `${percent.toFixed(1)}%`;
}

/** How much is memorized: "17.9% of the Quran memorized", and each juz's share (the dots). */
export function memorizedText(pages: UserPage[]) {
  const stats = computeMemorizationStats(pages);
  const fraction = stats.pages / 604;
  return {
    body: `${formatPercent(fraction)} of the Quran memorized`,
    /** Of the 604 pages. */
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
 * Today on Home, in one post: today's pages, the juz and surahs they cover
 * (with a ›: Jump to… or Edit schedule), the one action (start, continue,
 * review), and under it how much of the Quran is memorized (› opens the
 * memorized pages to edit), with a dot per juz. No ⋯: those two are the menu.
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
  onPrimary,
  onEditSchedule,
  onMemorization,
  onJump,
  leftovers,
  onCarryOver,
  carrying,
}: {
  name: string;
  initial: string;
  status: TodayStatus;
  pages: number[];
  juzBreakdown: { juz: number; pages: number[] }[];
  done: ReadonlySet<number>;
  streak: number;
  /** How much is memorized (memorizedText): the line and the juz dots. */
  memorized: { body: string; fraction: number; juz: number[] };
  onPrimary: () => void;
  onEditSchedule: () => void;
  /** Opens the memorized pages, ready to edit. */
  onMemorization: () => void;
  /** Where today starts (Jump to…). */
  onJump: () => void;
  leftovers: number;
  onCarryOver: () => void;
  carrying: boolean;
}) {
  const { palette } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const text = todayText(status, pages, done, juzBreakdown);
  const empty = pages.length === 0;
  const meta = streak > 0 ? `Today · ${streak}-day streak` : 'Today';

  const actions: SheetAction[] = [
    {
      key: 'jump',
      label: 'Jump to…',
      subtitle: 'Start today at another juz, surah or page',
      icon: 'locate-outline',
      onPress: onJump,
    },
    { key: 'schedule', label: 'Edit schedule', icon: 'calendar-outline', onPress: onEditSchedule },
  ];

  // Today's pages and what they cover; with something to revise, a › and a menu.
  const summary = (
    <>
      <View style={styles.titleRow}>
        {status === 'completed' ? (
          <View style={[styles.dot, { backgroundColor: palette.done }]} accessibilityElementsHidden />
        ) : null}
        <RowText>{text.title}</RowText>
      </View>
      <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={1.6}>
        {text.detail}
        {empty ? null : (
          <>
            {' '}
            <Ionicons name="chevron-forward" size={13} color={palette.secondary} />
          </>
        )}
      </Text>
    </>
  );

  return (
    <View testID="today-thread">
      <ThreadRow
        mark={<Mark label={initial} />}
        name={name || 'Today'}
        meta={name ? meta : undefined}
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
            <Tap
              onPress={onMemorization}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={`${memorized.body}. Edit memorized pages`}
              style={styles.memorized}
              testID="today-memorized"
            >
              {/* The › inside the text, so a long line wraps instead of cutting off. */}
              <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={1.6}>
                {memorized.body}{' '}
                <Ionicons name="chevron-forward" size={13} color={palette.secondary} />
              </Text>
            </Tap>
            <JuzDots juz={memorized.juz} progress={memorized.fraction} label={memorized.body} testID="today-dots" />
          </>
        }
      >
        {empty ? (
          <View testID="today-summary">{summary}</View>
        ) : (
          <Tap
            onPress={() => setMenuOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={`${text.title}. ${text.detail}`}
            accessibilityHint="Jump to another start, or edit the schedule"
            testID="today-summary"
          >
            {summary}
          </Tap>
        )}
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
