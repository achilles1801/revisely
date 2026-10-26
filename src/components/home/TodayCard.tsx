import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { describePageRuns, describeSurahRuns, pageRuns } from '../../lib/pageRanges';
import { layoutV2, radiusV2, typeV2 } from '../../theme/v2';
import { Button } from '../ui/Button';
import { RubElHizb } from '../ui/RubElHizb';
import { PressableScale } from '../PressableScale';

/** Streak lengths worth marking (in gold): the only gold on Home. */
export const STREAK_LANDMARKS = [7, 30, 100, 365];
const MAX_CHIPS = 40;

export type TodayStatus = 'not_started' | 'partial' | 'completed';

/** What the card says, from today's pages and what's done. */
export function todayCopy(status: TodayStatus, pages: number[], done: ReadonlySet<number>) {
  const runs = pageRuns(pages);
  const total = runs.reduce((n, r) => n + r.last - r.first + 1, 0);
  const count = (n: number) => `${n} page${n === 1 ? '' : 's'}`;
  if (total === 0) {
    return {
      title: 'Nothing to revise yet',
      detail: "Start by marking what you've memorized. Most people begin with Juz 30.",
      cta: 'Mark memorized pages',
    };
  }
  const where = describeSurahRuns(runs);
  if (status === 'completed') {
    return { title: 'Done for today', detail: `${count(Math.max(done.size, total))} kept. ${where}`, cta: 'Review session' };
  }
  if (status === 'partial') {
    const left = Math.max(0, total - done.size);
    return { title: `${count(left)} to go`, detail: `${describePageRuns(runs)} · ${where}`, cta: 'Continue revision' };
  }
  return { title: describePageRuns(runs), detail: `${where} · ${count(total)}`, cta: 'Start revision' };
}

/**
 * Home's one card in the new design: today as real pages and surahs, a strip
 * of page chips (done ones fill jade as you revise), one filled action.
 */
export function TodayCard({
  status,
  pages,
  done,
  streak,
  onPrimary,
  onEditSchedule,
  leftovers,
  onCarryOver,
  carrying,
  onPushBack,
  shifting,
}: {
  status: TodayStatus;
  pages: number[];
  done: ReadonlySet<number>;
  streak: number;
  onPrimary: () => void;
  onEditSchedule: () => void;
  leftovers: number;
  onCarryOver: () => void;
  carrying: boolean;
  onPushBack: () => void;
  shifting: boolean;
}) {
  const { palette } = useTheme();
  const copy = todayCopy(status, pages, done);
  const sorted = useMemo(() => [...new Set(pages)].sort((a, b) => a - b), [pages]);
  const empty = sorted.length === 0;
  const landmark = STREAK_LANDMARKS.includes(streak);

  return (
    <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.line }]} testID="today-card">
      <View style={styles.top}>
        <Text style={[typeV2.subhead, { color: palette.ink2 }]}>Today</Text>
        <View style={styles.topRight}>
          {streak > 0 && (
            <View style={styles.streak} accessibilityLabel={`${streak}-day streak`}>
              {landmark && <RubElHizb size={14} color={palette.gold} />}
              <Text style={[typeV2.footnote, typeV2.numeral, { color: landmark ? palette.gold : palette.ink2 }]}>
                {streak} {streak === 1 ? 'day' : 'days'}
              </Text>
            </View>
          )}
          <PressableScale
            onPress={onEditSchedule}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Edit schedule"
            style={[styles.iconBtn, { backgroundColor: palette.surfaceSunken }]}
          >
            <Ionicons name="calendar-outline" size={17} color={palette.ink2} />
          </PressableScale>
        </View>
      </View>

      <Text style={[typeV2.title, { color: palette.ink }]} testID="today-title">
        {copy.title}
      </Text>
      <Text style={[typeV2.subhead, styles.detail, { color: palette.ink2 }]}>{copy.detail}</Text>

      {!empty && (
        <View style={styles.chips} accessibilityLabel={`${done.size} of ${sorted.length} pages done`} accessible>
          {sorted.slice(0, MAX_CHIPS).map((p) => {
            const isDone = done.has(p);
            return (
              <View
                key={p}
                style={[styles.chip, { backgroundColor: isDone ? palette.jade : palette.surfaceSunken }]}
                testID={isDone ? 'page-chip-done' : 'page-chip'}
              >
                <Text style={[typeV2.caption, typeV2.numeral, { color: isDone ? palette.onJade : palette.ink2 }]}>{p}</Text>
              </View>
            );
          })}
          {sorted.length > MAX_CHIPS && (
            <View style={[styles.chip, { backgroundColor: palette.surfaceSunken }]}>
              <Text style={[typeV2.caption, { color: palette.ink2 }]}>+{sorted.length - MAX_CHIPS}</Text>
            </View>
          )}
        </View>
      )}

      <Button
        title={copy.cta}
        onPress={onPrimary}
        variant={status === 'completed' ? 'tinted' : 'filled'}
        style={styles.cta}
        testID="today-cta"
      />

      {leftovers > 0 && (
        <Button
          variant="plain"
          title={carrying ? 'Updating…' : `Add ${leftovers} left from yesterday`}
          onPress={onCarryOver}
          disabled={carrying}
          accessibilityLabel={`Add ${leftovers} unrevised pages from yesterday to today`}
        />
      )}
      {status !== 'completed' && !empty && (
        <Button
          variant="plain"
          title={shifting ? 'Updating…' : 'Behind? Move the plan back a day'}
          onPress={onPushBack}
          disabled={shifting}
          accessibilityLabel="Behind on revision? Move your schedule back a day"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radiusV2.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: layoutV2.rowPaddingH + 4,
    gap: 4,
  },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  detail: { marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: 8 },
  chip: {
    minWidth: 36,
    height: 26,
    paddingHorizontal: 6,
    borderRadius: radiusV2.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cta: { marginTop: 8 },
});
