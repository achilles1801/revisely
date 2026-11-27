// The app's screens the tour draws (What's new 1.0.6): Home (as it was and as it is now, HOME-4/5), a take's summary
// (REVO-25), Account with its badges (ACCOUNT-4/5) and Activity (as it was and its one tab, ACT-35). Pictures in a
// phone's points with example figures, never an account's; never touched.

import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, ClipPath, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../context/ThemeContext';
import { RevoMark } from '../../revo/RevoMark';
import { BadgeMark } from '../../account/BadgeMark';
import type { Milestone } from '../../../lib/badges';
import { EXAMPLE_PHOTO, arabicV2, ramadanV2 } from '../../../theme/v2';
import { HomeGround } from '../../home/HomeGround';
import { Crescent, Lantern } from '../../ramadan/art';
import { T, at } from './parts';

export const TAB_Y = 790;
export const TAB_X = { home: 75, activity: 201, read: 327 } as const;

export function TabBar({ active }: { active: keyof typeof TAB_X }) {
  const { palette } = useTheme();
  const tab = (key: keyof typeof TAB_X, on: React.ComponentProps<typeof Ionicons>['name'], off: React.ComponentProps<typeof Ionicons>['name']) => (
    <View key={key} style={[at(TAB_X[key] - 20, 10, 40, 40), styles.tab]}>
      <Ionicons name={active === key ? on : off} size={26} color={active === key ? palette.accentText : palette.secondary} />
      {active === key ? <View style={[styles.tabDot, { backgroundColor: palette.accentText }]} /> : null}
    </View>
  );
  return (
    <View style={[at(0, TAB_Y, 402, 84), { backgroundColor: palette.bg, borderTopColor: palette.separator }, styles.tabBar]}>
      {tab('home', 'home', 'home-outline')}
      {tab('activity', 'pulse', 'pulse-outline')}
      {tab('read', 'book', 'book-outline')}
    </View>
  );
}

/** A photo for the example account: a sunset in a circle (no account's picture is ever drawn here). */
export function ExamplePhoto({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <ClipPath id="tourPhoto">
          <Circle cx={50} cy={50} r={50} />
        </ClipPath>
        <LinearGradient id="tourSky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={EXAMPLE_PHOTO.sky[0]} />
          <Stop offset="1" stopColor={EXAMPLE_PHOTO.sky[1]} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={100} height={100} fill="url(#tourSky)" clipPath="url(#tourPhoto)" />
      <Circle cx={60} cy={42} r={13} fill={EXAMPLE_PHOTO.sun} clipPath="url(#tourPhoto)" />
      <Path d="M0 64 Q30 50 55 62 T100 58 L100 100 L0 100 Z" fill={EXAMPLE_PHOTO.hill} clipPath="url(#tourPhoto)" />
      <Path d="M0 76 Q35 66 62 76 T100 74 L100 100 L0 100 Z" fill={EXAMPLE_PHOTO.hillDeep} clipPath="url(#tourPhoto)" />
    </Svg>
  );
}

/** The Today post's mark: the first letter, or the example photo with its latest badge (ACCOUNT-7). */
function TodayMark({ photo, badge }: { photo: boolean; badge: Milestone | null }) {
  const { palette } = useTheme();
  if (!photo) {
    return (
      <View style={[styles.letter, { backgroundColor: palette.fill }]}>
        <T style={[styles.name, { color: palette.text }]}>Y</T>
      </View>
    );
  }
  return (
    <View style={styles.markBox}>
      <ExamplePhoto size={44} />
      {/* On a ring of the page's colour at the picture's corner, as Home draws it (ProfilePicture). */}
      {badge ? <TodayBadge milestone={badge} /> : null}
    </View>
  );
}

/**
 * The latest badge at the Today post picture's corner, on a ring of the page's colour (ProfilePicture). `placed`: at the
 * corner of the picture it sits in; else where its parent puts it (a 21-point box centred on TODAY_BADGE).
 */
export function TodayBadge({ milestone, placed = true }: { milestone: Milestone; placed?: boolean }) {
  const { palette } = useTheme();
  return (
    <View style={[placed ? styles.markBadge : styles.markBadgeFree, { backgroundColor: palette.bg }]}>
      <BadgeMark milestone={milestone} size={18} number={false} />
    </View>
  );
}

/** Where the Today post's badge sits (the centre of the picture's corner), for the badge landing there. */
export const TODAY_BADGE = { x: 14 + 44 + 4 - 10.5, y: 120 + 44 + 4 - 10.5 } as const;

/** Home's old Today's journal row (now in Activity, HOME-4). */
export const JOURNAL_AT = { left: 0, top: 378, width: 402, height: 40 } as const;
export function JournalRow({ placed = true }: { placed?: boolean }) {
  const { palette } = useTheme();
  return (
    <View style={[placed ? at(JOURNAL_AT.left, JOURNAL_AT.top, JOURNAL_AT.width, JOURNAL_AT.height) : { height: JOURNAL_AT.height }, styles.journal, { borderColor: palette.separator, backgroundColor: palette.bg }]}>
      <Ionicons name="create-outline" size={20} color={palette.text} />
      <T style={[styles.body, { color: palette.text }]}>
        Today’s journal <T style={{ color: palette.secondary }}>Add a note</T>
      </T>
      <View style={styles.flex} />
      <Ionicons name="chevron-forward" size={16} color={palette.secondary} />
    </View>
  );
}

/** Home's old Recent sessions (now in Activity, HOME-4). */
export const RECENT_AT = { left: 0, top: 428, width: 402, height: 264 } as const;
export function RecentSessions({ placed = true }: { placed?: boolean }) {
  const { palette } = useTheme();
  return (
    <View style={[placed ? at(RECENT_AT.left, RECENT_AT.top, RECENT_AT.width, RECENT_AT.height) : { height: RECENT_AT.height }, { backgroundColor: palette.bg }]}>
      <View style={styles.recentHead}>
        <T style={[styles.name, { color: palette.text }]}>Recent sessions</T>
        <T style={[styles.body, { color: palette.link }]}>See all</T>
      </View>
      {[
        ['Revised 20 pages', '2d', 'Adh-Dhariyat to Al-Hadid · 29 min'],
        ['Revised 20 pages', '3d', 'Al-Fatihah to Al-Baqarah · 26 min'],
        ['Revised 20 pages', '4d', 'An-Naba to Al-Fil · 30 min'],
      ].map(([a, when, b]) => (
        <View key={when} style={styles.session}>
          <View style={[styles.check, { backgroundColor: palette.done }]}>
            <Ionicons name="checkmark" size={18} color={palette.onDone} />
          </View>
          <View style={styles.flex}>
            <T style={[styles.name, { color: palette.text }]}>
              {a} <T style={[styles.meta, { color: palette.secondary }]}>{when}</T>
            </T>
            <T style={[styles.meta, { color: palette.secondary }]}>{b}</T>
          </View>
        </View>
      ))}
    </View>
  );
}

/** Home's old Add to today button (now the grey line's link, HOME-5). */
export function AddToTodayButton() {
  const { palette } = useTheme();
  return (
    <View style={[{ width: 318, height: 36 }, styles.outline, { borderColor: palette.outline, backgroundColor: palette.bg }]}>
      <T style={[styles.button, { color: palette.text }]}>Add to today</T>
    </View>
  );
}

/** The ayah at Home's foot (HOME-7): one a day; Al-Qamar 54:17 here, in Saheeh International's words. */
export function HomeAyah() {
  const { palette, isDark } = useTheme();
  const gold = ramadanV2(isDark, palette.accent).gold;
  return (
    <View style={styles.ayah}>
      <View style={styles.ornament}>
        <View style={[styles.rule, { backgroundColor: gold }]} />
        <View style={[styles.diamond, { backgroundColor: gold }]} />
        <View style={[styles.rule, { backgroundColor: gold }]} />
      </View>
      <T style={[arabicV2(21), styles.centerText, { color: palette.text, opacity: 0.85 }]}>
        وَلَقَدْ يَسَّرْنَا ٱلْقُرْءَانَ لِلذِّكْرِ فَهَلْ مِن مُّدَّكِرٍ
      </T>
      <T style={[styles.meta, styles.centerText, { color: palette.secondary, marginTop: 4 }]}>
        And We have certainly made the Qur’an easy for remembrance, so is there any who will remember?
      </T>
      <T style={[styles.meta, styles.centerText, { color: palette.secondary, marginTop: 6, opacity: 0.8 }]}>Al-Qamar 54:17</T>
    </View>
  );
}

/** Where Home hangs its lanterns (the top bar's empty side) and its tab bar's lights (THEME-1). */
export const HOME_LANTERNS = [22, 56, 90] as const;
export const TAB_BULBS = Array.from({ length: 13 }, (_, i) => [10 + i * 30.5, TAB_Y - 6 + (i % 2) * 3] as const);

/** Home's decorations in Ramadan (THEME-1): lanterns under the status bar, the crescent, the light falling, the bulbs over the tab bar. */
function HomeDecor() {
  const { palette, isDark } = useTheme();
  const tokens = ramadanV2(isDark, palette.accent);
  return (
    <>
      <View style={[at(0, 56, 402, 2), styles.wire, { backgroundColor: tokens.wire }]} />
      {HOME_LANTERNS.map((x, i) => (
        <View key={x} style={[at(x - 8, 56, 16, 50), styles.center]}>
          <View style={{ width: 1, height: 10 + (i % 2) * 6, backgroundColor: tokens.wire }} />
          <Lantern height={30} tokens={tokens} />
        </View>
      ))}
      {[
        [40, 470, 3],
        [300, 410, 2],
        [210, 520, 2.5],
        [120, 600, 2],
        [350, 560, 3],
      ].map(([x, y, r], i) => (
        <View key={i} style={[at(x, y, r, r), { borderRadius: r, backgroundColor: tokens.mote, opacity: tokens.moteOpacity }]} />
      ))}
      {TAB_BULBS.map(([x, y], i) => (
        <View key={i} style={[at(x, y, 6, 6), { borderRadius: 3, backgroundColor: tokens.bulbs[i % 3] }]} />
      ))}
    </>
  );
}

/**
 * Home: the Today post, then (as it was) Add to today, Today's journal and Recent sessions; now today alone (HOME-4/5).
 * `clean`: as it is now by default, its glow carried down with an ayah at its foot (HOME-6, HOME-7) and, in Ramadan, its
 * decorations; `foot` draws the ayah (a slide moves it in).
 */
export function HomeSketch({
  v3,
  photo = false,
  clean = false,
  decor = true,
  greetingEnd,
  badge = 100,
  foot,
}: {
  v3: boolean;
  photo?: boolean;
  clean?: boolean;
  /** With `clean`: Ramadan's decorations (off for a slide that brings them in itself). */
  decor?: boolean;
  /** Drawn after the greeting in place of its crescent (a slide's own, moving). */
  greetingEnd?: React.ReactNode;
  /** With `photo`: the latest badge at the picture's corner (Silver I unless a slide says), or none. */
  badge?: Milestone | null;
  foot?: React.ReactNode;
}) {
  const { palette, isDark } = useTheme();
  const name = photo ? 'Maryam' : 'Yusuf';
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.bg }]}>
      {clean ? <HomeGround background="ayah" ramadan bottom={874 - TAB_Y} /> : null}
      {clean && decor ? <HomeDecor /> : null}
      {clean ? <View style={at(32, 556, 338)}>{foot ?? <HomeAyah />}</View> : null}
      <View style={[at(0, 62, 402, 44), styles.homeTop]}>
        <View style={styles.salam}>
          <T style={[arabicV2(22), { color: palette.text }]}>السلام عليكم</T>
          {greetingEnd ?? (clean && decor ? <Crescent size={17} tokens={ramadanV2(isDark, palette.accent)} /> : null)}
        </View>
        <View style={at(358, 9)}>
          <Ionicons name="settings-outline" size={26} color={palette.text} />
        </View>
      </View>
      <View style={at(14, 120)}>
        <TodayMark photo={photo} badge={badge} />
      </View>
      <View style={at(68, 122, 320)}>
        <T style={[styles.meta, { color: palette.secondary }]}>
          <T style={[styles.name, { color: palette.text }]}>{name}</T> Today · 12-day streak
        </T>
        <T style={[styles.name, { color: palette.text }]}>
          Starts at Al-Mulk <T style={{ color: palette.link }}>Change</T>
        </T>
        <T style={[styles.body, { color: palette.secondary }]}>20 pages · to Al-Mursalat · Juz 29</T>
      </View>
      {v3 ? (
        <>
          <View style={[at(70, 200), styles.solid, { backgroundColor: palette.primary }]}>
            <T style={[styles.button, { color: palette.onPrimary }]}>Start revision</T>
          </View>
          <T style={[styles.meta, at(70, 246), { color: palette.secondary }]}>
            Missed yesterday · Juz 28 <T style={{ color: palette.link, fontWeight: '600' }}>Add to today</T>
          </T>
          <T style={[styles.meta, at(70, 274), { color: palette.secondary }]}>17.2% of the Quran memorized ›</T>
        </>
      ) : (
        <>
          <T style={[styles.meta, at(68, 200), { color: palette.secondary }]}>Missed yesterday · Revise Juz 28</T>
          <View style={[at(68, 226, 318, 36), styles.outline, { borderColor: palette.outline }]}>
            <T style={[styles.button, { color: palette.text }]}>Add to today</T>
          </View>
          <View style={[at(68, 270), styles.solid, { backgroundColor: palette.primary }]}>
            <T style={[styles.button, { color: palette.onPrimary }]}>Start revision</T>
          </View>
          <T style={[styles.meta, at(68, 318), { color: palette.secondary }]}>17.2% of the Quran memorized ›</T>
          <JournalRow />
          <RecentSessions />
        </>
      )}
      <View style={at(340, 728)}>
        <RevoMark size={44} />
      </View>
      <TabBar active="home" />
    </View>
  );
}

/** Account, at one of three moments: just set up, midway to a badge, or a new badge just won. */
export type AccountState = 'first' | 'midway' | 'crossed';
const ACCOUNT: Record<AccountState, { from: Milestone; to: Milestone; won: boolean; fill: number; line: string; figures: [string, string, string] }> = {
  first: { from: 10, to: 10, won: false, fill: 0, line: 'Revise 10 pages for your first badge', figures: ['0', '0 days', '5 min'] },
  midway: { from: 10, to: 50, won: true, fill: 0.68, line: '13 more for Bronze II', figures: ['37', '4 days', '1 hr'] },
  crossed: { from: 100, to: 250, won: true, fill: 0.03, line: 'New badge · Silver I', figures: ['103', '9 days', '3 hr'] },
};
export const ACCOUNT_PICTURE = { x: 201, y: 182, r: 48 } as const;
export const ACCOUNT_BAR = { left: 95, right: 310, y: 359 } as const;

export function AccountSketch({ state, photo }: { state: AccountState; photo: boolean }) {
  const { palette } = useTheme();
  const a = ACCOUNT[state];
  const [ra, rb] = palette.ring;
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.bg }]}>
      <View style={[at(0, 62, 402, 44), styles.accountTop]}>
        <View style={at(12, 9)}>
          <Ionicons name="chevron-back" size={26} color={palette.text} />
        </View>
        <T style={[styles.barTitle, { color: palette.text }]}>Account</T>
      </View>
      <View style={at(ACCOUNT_PICTURE.x - 54, ACCOUNT_PICTURE.y - 54)}>
        <Svg width={108} height={108}>
          <Defs>
            <LinearGradient id="tourRing" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={ra} />
              <Stop offset="1" stopColor={rb} />
            </LinearGradient>
          </Defs>
          <Circle cx={54} cy={54} r={51} stroke="url(#tourRing)" strokeWidth={3} fill="none" />
        </Svg>
      </View>
      <View style={[at(ACCOUNT_PICTURE.x - ACCOUNT_PICTURE.r, ACCOUNT_PICTURE.y - ACCOUNT_PICTURE.r, 96, 96), styles.picture, { backgroundColor: palette.fill }]}>
        {photo ? <ExamplePhoto size={96} /> : <T style={[styles.bigLetter, { color: palette.text }]}>M</T>}
      </View>
      <View style={[at(0, 246, 402), styles.nameRow]}>
        <T style={[styles.title22, { color: palette.text }]}>Maryam</T>
        {state !== 'first' ? <BadgeMark milestone={a.from} size={20} number={false} /> : null}
      </View>
      <View style={[at(0, 278, 402), styles.center]}>
        <View style={[styles.premium, { backgroundColor: palette.primary }]}>
          <T style={[styles.premiumText, { color: palette.onPrimary }]}>✦ Premium</T>
        </View>
      </View>
      <T style={[styles.meta, styles.centerText, at(0, 308, 402), { color: palette.secondary }]}>
        {state === 'first' ? 'Revising since today' : 'Revising since November 2026'}
      </T>
      <View style={at(ACCOUNT_BAR.left - 44, ACCOUNT_BAR.y - 16)}>
        <BadgeMark milestone={a.from} size={32} locked={!a.won} />
      </View>
      <View style={[at(ACCOUNT_BAR.left, ACCOUNT_BAR.y - 3, ACCOUNT_BAR.right - ACCOUNT_BAR.left, 6), styles.track, { backgroundColor: palette.track }]}>
        <View style={[styles.trackFill, { width: `${a.fill * 100}%`, backgroundColor: palette.accentText }]} />
      </View>
      <View style={at(ACCOUNT_BAR.right + 10, ACCOUNT_BAR.y - 14)}>
        <BadgeMark milestone={a.to} size={28} locked />
      </View>
      <T style={[styles.meta, styles.centerText, at(0, 382, 402), { color: state === 'crossed' ? palette.link : palette.secondary }]}>{a.line}</T>
      {a.figures.map((f, i) => (
        <View key={i} style={[at(20 + i * 124, 432, 116), styles.center]}>
          <T style={[styles.figure, { color: palette.text }]}>{f}</T>
          <T style={[styles.meta, { color: palette.secondary }]}>{['pages revised', 'longest streak', 'in Revisely'][i]}</T>
        </View>
      ))}
      <View style={[at(0, 500, 402, 52), styles.listRow, { borderBottomColor: palette.separator }]}>
        <Ionicons name="person-outline" size={22} color={palette.text} />
        <T style={[styles.body, styles.flex, { color: palette.text }]}>Name and email</T>
        <T style={[styles.body, { color: palette.secondary }]}>Maryam ›</T>
      </View>
      <View style={[at(0, 568, 402, 52), styles.listRow]}>
        <Ionicons name="log-out-outline" size={22} color={palette.text} />
        <T style={[styles.body, styles.flex, { color: palette.text }]}>Sign out</T>
      </View>
      <TabBar active="home" />
    </View>
  );
}

// ------------------------------------------------------------------ Activity
const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
/** October 2026's rows as the old month showed them (the 1st on a Thursday): a day number, or null. */
export const MONTH_ROWS: (number | null)[][] = [0, 1, 2, 3, 4].map((r) =>
  [0, 1, 2, 3, 4, 5, 6].map((c) => {
    const d = r * 7 + c - 3;
    return d >= 1 && d <= 31 ? d : null;
  }),
);
/** The week Activity opens on now (ACT-35): the row holding the 28th. */
export const WEEK_ROW = 4;
export const MONTH_TOP = 200;
export const ROW_H = 46;

function DayDot({ day, done, today }: { day: number; done: boolean; today?: boolean }) {
  const { palette } = useTheme();
  return (
    <View style={[styles.day, done && { backgroundColor: palette.primary }, today && { borderWidth: 2, borderColor: palette.primary }]}>
      <T style={[styles.dayText, { color: done ? palette.onPrimary : palette.secondary }]}>{day}</T>
    </View>
  );
}

/** One row of the old month (each row is its own piece, so the month can fold into the week). */
export function MonthRow({ row }: { row: (number | null)[] }) {
  return (
    <View style={styles.weekRow}>
      {row.map((d, i) => (
        <View key={i} style={styles.dayCell}>
          {d != null ? <DayDot day={d} done={d <= 28 && (d * 7) % 5 !== 0} /> : null}
        </View>
      ))}
    </View>
  );
}

/** Activity as it was, without its month's rows (drawn as pieces over it): Overview | Insights and the month's head. */
export function ActivityOldFrame() {
  const { palette } = useTheme();
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.bg }]}>
      <View style={[at(0, 62, 402, 44), styles.activityTop]}>
        <T style={[styles.barTitle, { color: palette.text }]}>Activity</T>
        <View style={[at(318, 10), styles.icons]}>
          <Ionicons name="help-circle-outline" size={22} color={palette.text} />
          <Ionicons name="search" size={22} color={palette.text} />
        </View>
      </View>
      <View style={[at(0, 158, 402), styles.monthHead]}>
        <T style={[styles.barTitle, { color: palette.text }]}>October 2026</T>
        <View style={styles.flex} />
        <Ionicons name="chevron-back" size={20} color={palette.secondary} />
        <Ionicons name="chevron-forward" size={20} color={palette.secondary} />
      </View>
      <TabBar active="activity" />
    </View>
  );
}

/** The old switch, Overview | Insights. */
export function OverviewInsights() {
  const { palette } = useTheme();
  return (
    <View style={[styles.pills, { backgroundColor: palette.fill }]}>
      <View style={[styles.pillOn, { backgroundColor: palette.sheet }]}>
        <T style={[styles.button, { color: palette.text }]}>Overview</T>
      </View>
      <View style={styles.pillOff}>
        <T style={[styles.button, { color: palette.secondary }]}>Insights</T>
      </View>
    </View>
  );
}

/** The one Activity tab's top (ACT-35): this week and its days. */
export function ActivityWeek({ bare = false }: { bare?: boolean }) {
  const { palette } = useTheme();
  return (
    <View style={[StyleSheet.absoluteFill, !bare && { backgroundColor: palette.bg }]}>
      <View style={[at(0, 62, 402, 44), styles.activityTop]}>
        <T style={[styles.barTitle, { color: palette.text }]}>Activity</T>
        <View style={[at(318, 10), styles.icons]}>
          <Ionicons name="help-circle-outline" size={22} color={palette.text} />
          <Ionicons name="search" size={22} color={palette.text} />
        </View>
      </View>
      <View style={[at(16, 116, 370), styles.monthHead]}>
        <T style={[styles.title22, { color: palette.text }]}>This week</T>
        <View style={styles.flex} />
        <T style={[styles.body, { color: palette.link }]}>Month ›</T>
      </View>
      <T style={[styles.meta, at(16, 146), { color: palette.secondary }]}>6 of 7 days revised · 3 h read</T>
      <View style={at(0, 176, 402)}>
        <View style={styles.weekRow}>
          {DAYS.map((d, i) => (
            <View key={i} style={styles.dayCell}>
              <T style={[styles.meta, { color: palette.secondary }]}>{d}</T>
            </View>
          ))}
        </View>
        <View style={styles.weekRow}>
          {[25, 26, 27, 28, 29, 30, 31].map((d) => (
            <View key={d} style={styles.dayCell}>
              <DayDot day={d} done={d !== 30 && d !== 25} today={d === 28} />
            </View>
          ))}
        </View>
      </View>
      <TabBar active="activity" />
    </View>
  );
}

/** The picked day under the week (Wednesday 28 October), its figures. */
export function ActivityDay() {
  const { palette } = useTheme();
  return (
    <View>
      <View style={styles.monthHead}>
        <T style={[styles.name, { color: palette.text }]}>Wednesday 28 October</T>
        <View style={styles.flex} />
        <Ionicons name="chevron-forward" size={16} color={palette.secondary} />
      </View>
      <View style={styles.dayCard}>
        <Svg width={40} height={40}>
          <Circle cx={20} cy={20} r={17} stroke={palette.primary} strokeWidth={3} fill="none" />
        </Svg>
        <View>
          <T style={[styles.figure, { color: palette.text }]}>
            20 of 20 <T style={[styles.body, { color: palette.secondary }]}>revised</T>
          </T>
          <T style={[styles.meta, { color: palette.secondary }]}>Juz 28 · 31 min</T>
        </View>
      </View>
      <View style={styles.chipRow}>
        {['Memorized 1 page', 'Read 22 min', '2 takes · 96%', 'Spot test ✓'].map((c) => (
          <View key={c} style={[styles.smallChip, { backgroundColor: palette.fill }]}>
            <T style={[styles.meta, { color: palette.text }]}>{c}</T>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Insights, as rows under the day (ACT-35). */
export const INSIGHT_ROWS: [string, string, string][] = [
  ['Coverage', 'Juz 4 untouched the longest, 41 days', '87%'],
  ['Consistency', 'Mostly 5–7 AM, then 9–10 PM', '27 of 30 days'],
  ['Gaps', '2 days without revising, 9–10 October', '1 in 30 days'],
];
export function InsightRow({ row }: { row: [string, string, string] }) {
  const { palette } = useTheme();
  return (
    <View style={[styles.insight, { borderBottomColor: palette.separator }]}>
      <View style={styles.flex}>
        <T style={[styles.name, { color: palette.text }]}>{row[0]}</T>
        <T style={[styles.meta, { color: palette.secondary }]}>{row[1]}</T>
      </View>
      <T style={[styles.name, { color: palette.text }]}>{row[2]} ›</T>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center' },
  centerText: { textAlign: 'center' },
  name: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 20 },
  meta: { fontSize: 13, lineHeight: 18 },
  button: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  barTitle: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  title22: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  figure: { fontSize: 22, lineHeight: 28, fontWeight: '700', fontVariant: ['tabular-nums'] },
  tabBar: { borderTopWidth: StyleSheet.hairlineWidth },
  tab: { alignItems: 'center' },
  tabDot: { width: 5, height: 5, borderRadius: 3, marginTop: 4 },
  homeTop: { alignItems: 'center', justifyContent: 'center' },
  salam: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ayah: { alignItems: 'center' },
  ornament: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  rule: { width: 26, height: 1, opacity: 0.7 },
  diamond: { width: 6, height: 6, transform: [{ rotate: '45deg' }] },
  wire: { opacity: 0.6 },
  letter: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  markBox: { width: 44, height: 44 },
  markBadge: { position: 'absolute', right: -4, bottom: -4, padding: 1.5, borderRadius: 11 },
  markBadgeFree: { padding: 1.5, borderRadius: 11 },
  solid: { height: 33, paddingHorizontal: 16, borderRadius: 17, justifyContent: 'center' },
  outline: { borderWidth: 1, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  journal: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  recentHead: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  session: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  check: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  accountTop: { alignItems: 'center', justifyContent: 'center' },
  picture: { borderRadius: 48, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  bigLetter: { fontSize: 40, lineHeight: 46, fontWeight: '600' },
  nameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  premium: { borderRadius: 11, paddingHorizontal: 10, paddingVertical: 2 },
  premiumText: { fontSize: 12, lineHeight: 18, fontWeight: '700' },
  track: { borderRadius: 3, overflow: 'hidden' },
  trackFill: { height: 6, borderRadius: 3 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  activityTop: { alignItems: 'center', justifyContent: 'center' },
  icons: { flexDirection: 'row', gap: 14 },
  monthHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 6 },
  pills: { flexDirection: 'row', padding: 3, borderRadius: 19, width: 220, alignSelf: 'center' },
  pillOn: { flex: 1, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  pillOff: { flex: 1, height: 30, alignItems: 'center', justifyContent: 'center' },
  weekRow: { flexDirection: 'row', paddingHorizontal: 10, height: ROW_H, alignItems: 'center' },
  dayCell: { flex: 1, alignItems: 'center' },
  day: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dayText: { fontSize: 14, lineHeight: 18, fontWeight: '600', fontVariant: ['tabular-nums'] },
  dayCard: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 14 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingTop: 16 },
  smallChip: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  insight: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
});
