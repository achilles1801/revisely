import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../context/ThemeContext';
import { aheadLine, NBSP, todayLines, type TodayLines, type TodayStatus, type PartialPages } from '../../../lib/todayLines';
import type { UserPage } from '../../../types';
import { typeV2 } from '../../../theme/v2';
import { ProgressRing } from '../../activity/DayParts';
import { FirstWords } from '../../v2/FirstWords';
import { Mark } from '../../v2/Mark';
import { JuzDots } from '../../v2/JuzDots';
import { PillButton } from '../../v2/PillButton';
import { ThreadRow } from '../../v2/ThreadRow';
import { ProgressBar } from '../../ProgressBar';
import { Tap } from '../../v2/Tap';
import { t } from '../../../i18n';
import { forwardIcon } from '../../../i18n/direction';

export type { TodayStatus } from '../../../lib/todayLines';
// How much is memorized, worked out with the rest of Home's today (lib/homeToday).
export { formatPercent, memorizedText } from '../../../lib/homeToday';

/**
 * How far the assignment lines and the memorized line grow with Dynamic Type:
 * at the largest size each still fits two lines on an iPhone SE (and shrinks
 * to fit if a long surah name would need a third).
 */
const LINES_MAX_SCALE = 1.6;
/** The name and streak above them, like the top bar and the buttons. */
export const HEADER_MAX_SCALE = 1.4;

/**
 * A › that grows with the text around it (icons don't scale by themselves).
 * Put a no-break space before it so it never starts a line alone.
 */
function Chevron({ color }: { color: string }) {
  return <Ionicons name={forwardIcon()} size={14} color={color} allowFontScaling />;
}

/**
 * Today on Home, in one post (lib/todayLines): where today starts and how much
 * it is, with "Change", which opens Jump to (HOME-3; Edit schedule is in
 * Settings → Revision); the one action (start, continue, review); then how much
 * of the Quran is memorized (its › opens the memorized pages to edit), with a
 * dot per juz. No ⋯ and no menu.
 */
export function TodayPost({
  name,
  initial,
  picture,
  onPicture,
  status,
  pages,
  done,
  carried = 0,
  carriedLeft = 0,
  carriedInsights = 0,
  partial,
  streak,
  streakGrace,
  memorized,
  onPrimary,
  onMemorization,
  memorizedLine = true,
  onJump,
  catchUp,
  onCarryOver,
  carrying,
  quietCatchUp = false,
  separator = true,
  ahead,
  onAhead,
  help,
  lines: given,
}: {
  name: string;
  initial: string;
  /** The account's picture in the mark's place (ACCOUNT-7, the Account page's new look), with the latest badge. */
  picture?: React.ReactNode;
  /** A tap on the picture: Account. */
  onPicture?: () => void;
  status: TodayStatus;
  /** Today's pages, in the session's order. */
  pages: number[];
  done: ReadonlySet<number>;
  /** How many of today's pages were carried in from yesterday (they come first). */
  carried?: number;
  /** Of those, how many are still to revise (once today's own pages are done, the button goes on to them). */
  carriedLeft?: number;
  /** Of those, how many Insights put there ("Revise these first tomorrow"): "2 from Insights first". */
  carriedInsights?: number;
  /** The partly memorized pages and their memorized ayahs: named by those (MEM-4). */
  partial?: PartialPages;
  streak: number;
  /** Yesterday missed but restorable (SESS-6): the streak reads dimmed, with a ring for the missed pages. */
  streakGrace?: { previous: number; progress: { scheduled: number; credited: number } } | null;
  /** How much is memorized (memorizedText): the line and the juz dots. */
  memorized: { body: string; fraction: number; juz: number[] };
  onPrimary: () => void;
  /** Opens the memorized pages, ready to edit. */
  onMemorization: () => void;
  /** The memorized line and the juz dots at the post's end; Revisely Dev has them off Home (MEM-9). Default true. */
  memorizedLine?: boolean;
  /** Where today starts: "Change" (and a tap on the line) opens Jump to. */
  onJump: () => void;
  /** The catch-up offer for pages missed on earlier days (catchUpLine), or none. */
  catchUp: { title: string; label: string } | null;
  onCarryOver: () => void;
  carrying: boolean;
  /**
   * HOME-5 (Revisely Dev): the catch-up is a grey line under the button, ending in "Add to today" in the accent colour
   * (catchUpLine's quiet form); else the line, then "Add to today" as a button, above it (CARRY-1).
   */
  quietCatchUp?: boolean;
  /** The hairline under the post: only when something follows it (HOME-6: with nothing under it, Home's ground runs on). */
  separator?: boolean;
  /** Done today, or a rest day (HOME-9): the next revision day, for the quiet line (or the rest day's detail) that opens it. */
  ahead?: { lead: string; first: number } | null;
  onAhead?: () => void;
  /** Home's ? (HELP-1), at the right of the header, where ⋯ was. */
  help?: React.ReactNode;
  /** The lines as Home worked them out (lib/homeToday), so Home draws exactly what the user-matrix test checks. */
  lines?: TodayLines;
}) {
  const { palette } = useTheme();
  // With pages memorized, a day with no pages is a rest day (HOME-9): never "Mark memorized pages".
  const lines =
    given ??
    todayLines(status, pages, done, carried, carriedLeft, partial, carriedInsights, {
      memorized: memorized.fraction > 0,
      next: ahead ?? null,
    });
  const grace = streakGrace ?? null;
  // In grace the streak that can come back shows dimmed, with a ring for the missed pages (SESS-6).
  const meta = grace
    ? t('home.today.streak', { days: grace.previous })
    : streak > 0
      ? t('home.today.streak', { days: streak })
      : t('common.today');

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
            // "Change", held to the line's last word so it never starts a line alone (HOME-3).
            <>
              {NBSP}
              {NBSP}
              <Text style={{ color: palette.accentText }} testID="today-change">
                {t('home.today.change')}
              </Text>
            </>
          ) : null}
        </Text>
      </View>
      <FirstWords words={lines.words} testID="today-first-words" />
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
            {t('common.nOfTotal', { n: detail.done, total: detail.total })}
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
        mark={
          picture ? (
            <Tap onPress={onPicture} accessibilityRole="button" accessibilityLabel={t('home.today.openAccount')} testID="today-picture">
              {picture}
            </Tap>
          ) : (
            <Mark label={initial} />
          )
        }
        name={name || t('common.today')}
        meta={name ? meta : undefined}
        figure={
          grace || help ? (
            <View style={styles.figure}>
              {grace ? (
                <ProgressRing
                  fraction={grace.progress.scheduled > 0 ? grace.progress.credited / grace.progress.scheduled : 0}
                  done={false}
                  size={18}
                />
              ) : null}
              {help}
            </View>
          ) : undefined
        }
        headerMaxScale={HEADER_MAX_SCALE}
        separator={separator}
        separatorTestID="today-post-separator"
        testID="today-post"
        footer={
          <>
            {catchUp && !quietCatchUp ? (
              // The missed pages come first: one line, then the button that adds them to today.
              <View style={styles.catchUp}>
                <Text style={[typeV2.body, { color: palette.secondary }]} {...fit} testID="today-catch-up">
                  {catchUp.title}
                </Text>
                <PillButton
                  title={carrying ? t('home.today.adding') : t('home.today.addToToday')}
                  variant="outline"
                  onPress={onCarryOver}
                  disabled={carrying}
                  accessibilityLabel={t('home.today.addToTodayLabel', { line: catchUp.label })}
                  testID="today-carry-over"
                />
              </View>
            ) : null}
            {lines.cta ? (
              <PillButton
                title={lines.cta}
                onPress={onPrimary}
                variant={lines.solid ? 'solid' : 'outline'}
                testID="today-cta"
              />
            ) : null}
            {catchUp && quietCatchUp ? (
              // HOME-5: Home's one button stays the Today post's; the missed pages are a quiet line under it, and a tap
              // anywhere on it adds them. "Add to today" is held together so it never breaks across lines.
              <Tap
                onPress={onCarryOver}
                disabled={carrying}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={t('home.today.addToTodayLabel', { line: catchUp.label })}
                accessibilityState={{ disabled: carrying }}
                style={styles.memorized}
                testID="today-carry-over"
              >
                <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={LINES_MAX_SCALE}>
                  <Text testID="today-catch-up">{catchUp.title}</Text>
                  {NBSP}
                  {NBSP}
                  <Text style={[styles.add, { color: palette.accentText }]} testID="today-add">
                    {(carrying ? t('home.today.adding') : t('home.today.addToToday')).split(' ').join(NBSP)}
                  </Text>
                </Text>
              </Tap>
            ) : null}
            {ahead && onAhead && status === 'completed' && !lines.rest ? (
              // Quiet: a grey line, not a second button. Opens that day's pages.
              <Tap
                onPress={onAhead}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={aheadLine(ahead.lead, ahead.first, partial).label}
                style={styles.memorized}
                testID="today-ahead"
              >
                <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={LINES_MAX_SCALE}>
                  {aheadLine(ahead.lead, ahead.first, partial).text}
                  {NBSP}
                  <Chevron color={palette.secondary} />
                </Text>
              </Tap>
            ) : null}
            {/* Revisely Dev (MEM-9): memorized pages are off Home, in Settings under Revision and in Activity. */}
            {memorizedLine ? (
              <>
                <Tap
                  onPress={onMemorization}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={t('home.today.editMemorizedLabel', { line: memorized.body })}
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
            ) : null}
          </>
        }
      >
        {lines.empty ? (
          <View testID="today-summary">{summary}</View>
        ) : (
          // Done, it shows no "Change", but a tap still opens Jump to (HOME-3).
          <Tap
            onPress={onJump}
            accessibilityRole="button"
            accessibilityLabel={lines.label}
            accessibilityHint={t('home.today.changeHint')}
            testID="today-summary"
          >
            {summary}
          </Tap>
        )}
      </ThreadRow>
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  figure: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  catchUp: { gap: 8 },
  shrink: { flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  bar: { flex: 1 },
  memorized: { width: '100%', marginTop: 4 },
  add: { fontWeight: '600' },
});
