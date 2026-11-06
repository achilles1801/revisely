import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../context/ThemeContext';
import { computeMemorizationStats } from '../../../lib/memorizationStats';
import { aheadLine, NBSP, todayLines, type TodayStatus } from '../../../lib/todayLines';
import type { UserPage } from '../../../types';
import { typeV2 } from '../../../theme/v2';
import { ProgressRing } from '../../activity/DayParts';
import { ActionSheet, SheetAction } from '../../v2/ActionSheet';
import { Mark } from '../../v2/Mark';
import { JuzDots } from '../../v2/JuzDots';
import { PillButton } from '../../v2/PillButton';
import { ThreadRow } from '../../v2/ThreadRow';
import { ProgressBar } from '../../ProgressBar';
import { Tap } from '../../v2/Tap';

export type { TodayStatus } from '../../../lib/todayLines';

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

/**
 * How far the assignment lines and the memorized line grow with Dynamic Type:
 * at the largest size each still fits two lines on an iPhone SE (and shrinks
 * to fit if a long surah name would need a third).
 */
const LINES_MAX_SCALE = 1.6;
/** The name and streak above them, like the top bar and the buttons. */
const HEADER_MAX_SCALE = 1.4;

/**
 * A › that grows with the text around it (icons don't scale by themselves).
 * Put a no-break space before it so it never starts a line alone.
 */
function Chevron({ color }: { color: string }) {
  return <Ionicons name="chevron-forward" size={14} color={color} allowFontScaling />;
}

/**
 * Today on Home, in one post (lib/todayLines): where today starts and how much
 * it is, with a › that opens Jump to… and Edit schedule (the exact pages in the
 * sheet's header); the one action (start, continue, review); then how much of
 * the Quran is memorized (its › opens the memorized pages to edit), with a dot
 * per juz. No ⋯: those are the menus.
 */
export function TodayPost({
  name,
  initial,
  status,
  pages,
  done,
  carried = 0,
  streak,
  streakGrace,
  memorized,
  onPrimary,
  onEditSchedule,
  onMemorization,
  onJump,
  catchUp,
  onCarryOver,
  carrying,
  ahead,
  onAhead,
}: {
  name: string;
  initial: string;
  status: TodayStatus;
  /** Today's pages, in the session's order. */
  pages: number[];
  done: ReadonlySet<number>;
  /** How many of today's pages were carried in from yesterday (they come first). */
  carried?: number;
  streak: number;
  /** Yesterday missed but restorable (SESS-6): the streak reads dimmed, with a ring for the missed pages. */
  streakGrace?: { previous: number; progress: { scheduled: number; credited: number } } | null;
  /** How much is memorized (memorizedText): the line and the juz dots. */
  memorized: { body: string; fraction: number; juz: number[] };
  onPrimary: () => void;
  onEditSchedule: () => void;
  /** Opens the memorized pages, ready to edit. */
  onMemorization: () => void;
  /** Where today starts (Jump to…). */
  onJump: () => void;
  /** The catch-up offer for pages missed on earlier days (catchUpLine), or none. */
  catchUp: { title: string; label: string } | null;
  onCarryOver: () => void;
  carrying: boolean;
  /** Done today: the next revision day, for the quiet line that opens it (revise ahead). */
  ahead?: { lead: string; first: number } | null;
  onAhead?: () => void;
}) {
  const { palette } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const lines = todayLines(status, pages, done, carried);
  const grace = streakGrace ?? null;
  // In grace the streak that can come back shows dimmed, with a ring for the missed pages (SESS-6).
  const meta = grace
    ? `Today · ${grace.previous}-day streak`
    : streak > 0
      ? `Today · ${streak}-day streak`
      : 'Today';

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

  // Two lines, each at most two lines tall: where today starts (ink), then how
  // much it is (grey), or how far it has got (a thin bar and "6 of 20").
  const fit = { numberOfLines: 2, adjustsFontSizeToFit: true, minimumFontScale: 0.7, maxFontSizeMultiplier: LINES_MAX_SCALE };
  const detail = lines.detail;
  const summary = (
    <>
      <View style={styles.titleRow}>
        {lines.title.dot ? (
          <View style={[styles.dot, { backgroundColor: palette.done }]} accessibilityElementsHidden testID="today-done-dot" />
        ) : null}
        <Text style={[typeV2.name, styles.shrink, { color: palette.text }]} {...fit} testID="today-title">
          {lines.title.text}
          {lines.title.chevron ? (
            <>
              {NBSP}
              <Chevron color={palette.secondary} />
            </>
          ) : null}
        </Text>
      </View>
      {detail.kind === 'progress' ? (
        <View style={styles.progressRow} testID="today-progress">
          <View style={styles.bar}>
            <ProgressBar progress={(detail.done / detail.total) * 100} height={4} trackColor={palette.track} />
          </View>
          <Text
            style={[typeV2.body, typeV2.numeral, { color: palette.secondary }]}
            numberOfLines={1}
            maxFontSizeMultiplier={LINES_MAX_SCALE}
          >
            {`${detail.done} of ${detail.total}`}
          </Text>
        </View>
      ) : (
        <Text style={[typeV2.body, { color: palette.secondary }]} {...fit} testID="today-detail">
          {detail.text}
        </Text>
      )}
    </>
  );

  return (
    <View testID="today-thread">
      <ThreadRow
        mark={<Mark label={initial} />}
        name={name || 'Today'}
        meta={name ? meta : undefined}
        figure={
          grace ? (
            <ProgressRing
              fraction={grace.progress.scheduled > 0 ? grace.progress.credited / grace.progress.scheduled : 0}
              done={false}
              size={18}
            />
          ) : undefined
        }
        headerMaxScale={HEADER_MAX_SCALE}
        testID="today-post"
        footer={
          <>
            {catchUp ? (
              // The missed pages come first: one line, then the button that adds them to today.
              <View style={styles.catchUp}>
                <Text style={[typeV2.body, { color: palette.secondary }]} {...fit} testID="today-catch-up">
                  {catchUp.title}
                </Text>
                <PillButton
                  title={carrying ? 'Adding…' : 'Add to today'}
                  variant="outline"
                  onPress={onCarryOver}
                  disabled={carrying}
                  accessibilityLabel={`${catchUp.label}. Add to today`}
                  testID="today-carry-over"
                />
              </View>
            ) : null}
            <PillButton
              title={lines.cta}
              onPress={onPrimary}
              variant={lines.solid ? 'solid' : 'outline'}
              testID="today-cta"
            />
            {ahead && onAhead && status === 'completed' ? (
              // Quiet: a grey line, not a second button. Opens that day's pages.
              <Tap
                onPress={onAhead}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={aheadLine(ahead.lead, ahead.first).label}
                style={styles.memorized}
                testID="today-ahead"
              >
                <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={LINES_MAX_SCALE}>
                  {aheadLine(ahead.lead, ahead.first).text}
                  {NBSP}
                  <Chevron color={palette.secondary} />
                </Text>
              </Tap>
            ) : null}
            <Tap
              onPress={onMemorization}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={`${memorized.body}. Edit memorized pages`}
              style={styles.memorized}
              testID="today-memorized"
            >
              {/* The › inside the text, held to its last word, so a long line wraps instead of cutting off. */}
              <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={LINES_MAX_SCALE}>
                {memorized.body}
                {NBSP}
                <Chevron color={palette.secondary} />
              </Text>
            </Tap>
            <JuzDots juz={memorized.juz} progress={memorized.fraction} label={memorized.body} testID="today-dots" />
          </>
        }
      >
        {lines.empty ? (
          <View testID="today-summary">{summary}</View>
        ) : (
          // Done, it shows no ›, but a tap still opens Jump to… and Edit schedule.
          <Tap
            onPress={() => setMenuOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={lines.label}
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
        message={lines.ranges}
        // A header line, like the title and the rows (1.4): at the largest
        // sizes a surah name would otherwise split mid-word on a small phone.
        messageMaxScale={HEADER_MAX_SCALE}
        actions={actions}
        testID="today-menu"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  catchUp: { gap: 8 },
  shrink: { flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  bar: { flex: 1 },
  memorized: { width: '100%', marginTop: 4 },
});
