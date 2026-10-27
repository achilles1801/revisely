import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../../context/ThemeContext';
import { describePageRuns, describeSurahRuns, pageRuns } from '../../../lib/pageRanges';
import { layoutV2, markV2, typeV2 } from '../../../theme/v2';
import { ActionSheet, SheetAction } from '../../v2/ActionSheet';
import { Mark } from '../../v2/Mark';
import { PillButton } from '../../v2/PillButton';
import { RowText, ThreadRow } from '../../v2/ThreadRow';
import { Tap } from '../../v2/Tap';

export type TodayStatus = 'not_started' | 'partial' | 'completed';

const MAX_REPLIES = 4;
const count = (n: number) => `${n} page${n === 1 ? '' : 's'}`;

/** What today's post says, from today's pages and those done. */
export function todayText(status: TodayStatus, pages: number[], done: ReadonlySet<number>) {
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
  const where = describeSurahRuns(runs);
  if (status === 'completed') {
    return { title: 'Done for today', detail: `${count(Math.max(done.size, total))} revised · ${where}`, cta: 'Review session', solid: false };
  }
  if (status === 'partial') {
    const doneHere = pages.filter((p) => done.has(p)).length;
    return { title: describePageRuns(runs), detail: `${doneHere} of ${total} done · ${where}`, cta: 'Continue revision', solid: true };
  }
  return { title: describePageRuns(runs), detail: `${where} · ${count(total)}`, cta: 'Start revision', solid: true };
}

/** One reply per juz of today's pages: its pages, its surahs, how many are done. */
export function juzReplies(juzBreakdown: { juz: number; pages: number[] }[], done: ReadonlySet<number>) {
  return juzBreakdown.map(({ juz, pages }) => {
    const runs = pageRuns(pages);
    const n = runs.reduce((s, r) => s + r.last - r.first + 1, 0);
    const d = pages.filter((p) => done.has(p)).length;
    return {
      juz,
      complete: n > 0 && d >= n,
      meta: d > 0 ? `${d} of ${n} done` : count(n),
      body: `${describePageRuns(runs)} · ${describeSurahRuns(runs)}`,
    };
  });
}

/**
 * Today on Home, as a thread: a post saying today's pages with the one action
 * (start, continue, review), and a reply for each juz they cover, joined by the
 * thread line. Each juz turns jade with a check once its pages are done. The ⋯
 * holds the schedule actions.
 */
export function TodayThread({
  name,
  initial,
  status,
  pages,
  juzBreakdown,
  done,
  streak,
  onPrimary,
  onEditSchedule,
  onMemorization,
  leftovers,
  onCarryOver,
  carrying,
  onPushBack,
  shifting,
}: {
  name: string;
  initial: string;
  status: TodayStatus;
  pages: number[];
  juzBreakdown: { juz: number; pages: number[] }[];
  done: ReadonlySet<number>;
  streak: number;
  onPrimary: () => void;
  onEditSchedule: () => void;
  onMemorization: () => void;
  leftovers: number;
  onCarryOver: () => void;
  carrying: boolean;
  onPushBack: () => void;
  shifting: boolean;
}) {
  const { palette } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const text = todayText(status, pages, done);
  const empty = pages.length === 0;
  const replies = useMemo(() => (empty ? [] : juzReplies(juzBreakdown, done)), [empty, juzBreakdown, done]);
  const visible = showAll ? replies : replies.slice(0, MAX_REPLIES);
  const hidden = replies.length - visible.length;
  const meta = streak > 0 ? `Today · ${streak}-day streak` : 'Today';

  const actions: SheetAction[] = [
    { key: 'schedule', label: 'Edit schedule', icon: 'calendar-outline', onPress: onEditSchedule },
    ...(status !== 'completed' && !empty
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
        mark={<Mark label={initial} />}
        name={name || 'Today'}
        meta={name ? meta : undefined}
        onMenu={() => setMenuOpen(true)}
        menuLabel="Today's options"
        lineBelow={visible.length > 0}
        separator={visible.length === 0}
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

      {visible.map((r, i) => {
        const last = i === visible.length - 1 && hidden === 0;
        return (
          <ThreadRow
            key={r.juz}
            depth={1}
            mark={<Mark size="reply" label={String(r.juz)} done={r.complete} testID={r.complete ? 'juz-done' : 'juz'} />}
            name={`Juz ${r.juz}`}
            meta={r.meta}
            lineAbove
            lineBelow={!last}
            separator={last}
            onPress={onPrimary}
            accessibilityLabel={`Juz ${r.juz}, ${r.meta}. ${r.body}`}
            testID={`today-juz-${r.juz}`}
          >
            <RowText secondary numberOfLines={2}>
              {r.body}
            </RowText>
          </ThreadRow>
        );
      })}

      {hidden > 0 ? (
        <View>
          <Tap
            onPress={() => setShowAll(true)}
            accessibilityRole="button"
            style={styles.more}
            testID="today-show-more"
          >
            <View style={styles.moreMarks}>
              <View style={[styles.moreLine, { backgroundColor: palette.separator }]} />
            </View>
            <Text style={[typeV2.meta, { color: palette.secondary }]}>
              Show {hidden} more juz
            </Text>
          </Tap>
          <View style={{ height: layoutV2.hairline, backgroundColor: palette.separator }} />
        </View>
      ) : null}

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
  more: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: layoutV2.gutter,
    paddingBottom: layoutV2.nestedPad,
  },
  moreMarks: { width: markV2.top, alignItems: 'center', marginRight: layoutV2.markGap, height: 20 },
  moreLine: { width: layoutV2.threadLine, height: 12, borderRadius: 1 },
});
