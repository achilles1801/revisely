// The tour's other slides (What's new 1.0.6, lib/whatsNew/tour): 4. Recite keeps up (RECITE-30, RECITE-2, RECITE-31);
// 5. Spot test yourself (RECITE-8, ACT-34); 6. Activity, in one place (ACT-35); 7. A calmer Home (HOME-4 to 7); 8. Unlock your next badge (ACCOUNT-4 to 8); 9. Ready for Ramadan (THEME-2 to 8). Pictures, never touched.

import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { runOnJS, useAnimatedProps, useAnimatedReaction } from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../context/ThemeContext';
import { BadgeMark } from '../../account/BadgeMark';
import { Crescent, Lantern, Moon } from '../../ramadan/art';
import { badgeOf, MILESTONES, milestoneLabel, type Milestone } from '../../../lib/badges';
import { BADGE_MATERIALS, ramadanV2 } from '../../../theme/v2';
import { getReadPalette } from '../../../theme/readPalette';
import { formatNumber } from '../../../i18n';
import {
  CLIMB_TOPS,
  SCREEN_AT,
  along,
  bump,
  climbCount,
  curve,
  easeBack,
  easeIn,
  easeInOut,
  easeOut,
  entering,
  lerp,
  seg,
} from '../../../lib/whatsNew/tour';
import { Anim, Glint, OnStage, RevoHeader, Ripple, Screen, Sheet, T, at, stageAt, useStage, type Clock, type ScreenAt } from './parts';
import { MushafScreen, lineOn, linesOn, wordX } from './screens';
import {
  ACCOUNT_BAR,
  ACCOUNT_PICTURE,
  AccountSketch,
  ActivityDay,
  ActivityOldFrame,
  ActivityWeek,
  AddToTodayButton,
  ExamplePhoto,
  HOME_LANTERNS,
  HomeAyah,
  HomeSketch,
  INSIGHT_ROWS,
  InsightRow,
  JOURNAL_AT,
  JournalRow,
  MONTH_ROWS,
  MONTH_TOP,
  MonthRow,
  OverviewInsights,
  RECENT_AT,
  ROW_H,
  RecentSessions,
  TAB_X,
  TAB_BULBS,
  TAB_Y,
  TODAY_BADGE,
  TodayBadge,
  WEEK_ROW,
} from './appScreens';
import { pointOn } from './revoSlides';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
/** A sparkle's white: silver's light (the badges' own material). */
const SPARK = BADGE_MATERIALS.silver.light;

function resting(t: number, zoom = 1, ox = 201, oy = 437): ScreenAt {
  'worklet';
  const e = entering(t);
  return { scale: SCREEN_AT.scale * e.scale, top: SCREEN_AT.top + e.dy, opacity: e.opacity, zoom, ox, oy };
}

/** A take's bar, at the reader's foot: the dot, where it stands, the score and the mic (or a line in its place). */
function TakeBar({ top, sub, score, line }: { top?: string; sub?: string; score: string; line?: string }) {
  const { palette } = useTheme();
  return (
    <View style={[at(12, 772, 378, 52), styles.capsule, { backgroundColor: palette.fill, borderColor: palette.separator }]}>
      {line ? (
        <T style={[styles.meta, styles.flex, { color: palette.text }]} numberOfLines={2}>
          <T style={{ color: palette.warn }}>● </T>
          {line}
        </T>
      ) : (
        <View style={styles.flex}>
          <T style={[styles.name13, { color: palette.text }]}>{top}</T>
          <T style={[styles.meta, { color: palette.secondary }]}>
            <T style={{ color: palette.red }}>● </T>
            {sub}
          </T>
        </View>
      )}
      <View style={[styles.scorePill, { backgroundColor: palette.fill, borderColor: palette.outline }]}>
        <T style={[styles.name13, { color: palette.good }]}>{score}</T>
      </View>
      <View style={[styles.micButton, { backgroundColor: palette.primary }]}>
        <View style={[styles.stop, { backgroundColor: palette.onPrimary }]} />
      </View>
    </View>
  );
}

// ------------------------------------------------------------------ 4. Recite keeps up (RECITE-30, RECITE-2, RECITE-31)
/** Al-Mulk 12, the last line of page 562: its words right to left (the page's word boxes, bounds space). */
const LAST_WORDS = [
  [934, 983],
  [846.8, 934.1],
  [721.6, 842.8],
  [613.6, 717.2],
  [488.4, 608.9],
  [408.4, 483.2],
  [291.4, 408.4],
  [211.1, 291.5],
  [141.8, 211.1],
].map(([a, b]) => wordX(a, b));
/** When the grey box reaches each word: a hesitation before the fifth, which is marked (RECITE-2), then on to the end. */
const REACH = [0.4, 0.7, 1.0, 1.3, 2.0, 2.25, 2.5, 2.75, 2.95];
const STUMBLE = 4;
/** Page 563's first word (Al-Mulk 13), where the next page waits. */
const NEXT_WORD = wordX(861.4, 968.8);

export function ReciteUpSlide({ t }: { t: Clock }) {
  const { palette } = useTheme();
  const last = useMemo(() => lineOn(562, 15), []);
  const first = useMemo(() => lineOn(563, 1), []);
  const place = (now: number): ScreenAt => {
    'worklet';
    return resting(now);
  };
  /** The grey box on the word being said: its left and width. */
  const box = (now: number): [number, number] => {
    'worklet';
    let k = 0;
    while (k + 1 < REACH.length && now >= REACH[k + 1]) k++;
    const a = LAST_WORDS[k];
    if (k + 1 >= REACH.length) return [a[0], a[1] - a[0]];
    const b = LAST_WORDS[k + 1];
    const u = easeBack(seg(now, REACH[k + 1] - 0.18, REACH[k + 1]));
    const x0 = lerp(a[0], b[0], u);
    const x1 = lerp(a[1], b[1], u);
    return [x0, x1 - x0];
  };
  const s = LAST_WORDS[STUMBLE];
  return (
    <>
      <Screen t={t} place={place}>
        {/* Following the page's last ayah: the soft band on its line, the grey box from word to word. */}
        <Anim t={t} box={StyleSheet.absoluteFill} style={(now) => {
          'worklet';
          return { opacity: now < 3.12 ? 1 : 0 };
        }}>
          <MushafScreen
            page={562}
            under={
              <>
                <View style={[at(last.left - 8, last.top - 4, last.width + 16, last.height + 8), { backgroundColor: palette.highlightSoft, borderRadius: 8 }]} />
                <Anim t={t} box={[at(0, last.top - 2, 10, last.height + 4), { backgroundColor: palette.highlight, borderRadius: 7 }]} style={(now) => {
                  'worklet';
                  const [x, w] = box(now);
                  return { opacity: seg(now, 0.25, 0.4), left: x - 2, width: w + 4 };
                }} />
                {/* A stumble: marked on the word reached for (RECITE-2). */}
                <Anim t={t} box={[at(s[0] - 2, last.top - 2, s[1] - s[0] + 4, last.height + 4), { backgroundColor: palette.red, borderRadius: 7 }]} style={(now) => {
                  'worklet';
                  const u = seg(now, 1.85, 2.25);
                  return { opacity: Math.min(1, u * 3) * 0.28, transform: [{ translateY: (1 - easeOut(u)) * -14 }, { scale: lerp(1.35, 1, easeBack(u)) }] };
                }} />
              </>
            }
          />
          {/* One bar's words cross into the other's (the bar's fill is see-through, so the first goes as the second comes). */}
          <Anim t={t} box={StyleSheet.absoluteFill} style={(now) => {
            'worklet';
            return { opacity: 1 - easeInOut(seg(now, 2.05, 2.35)) };
          }}>
            <TakeBar top="No mistakes" sub="1:12 · Al-Mulk, 1st page" score="100%" />
          </Anim>
          <Anim t={t} box={StyleSheet.absoluteFill} style={(now) => {
            'worklet';
            return { opacity: easeInOut(seg(now, 2.05, 2.35)) };
          }}>
            <TakeBar top="1 mistake" sub="1:16 · Hesitated here" score="98%" />
          </Anim>
        </Anim>
        {/* The last word said: the next page slides in from the left, as a printed mushaf turns (RECITE-30). */}
        <Anim t={t} box={StyleSheet.absoluteFill} style={(now) => {
          'worklet';
          const u = easeInOut(seg(now, 3.15, 3.95));
          return { opacity: now >= 3.1 && now < 3.97 ? 1 : 0, transform: [{ translateX: u * 402 }] };
        }}>
          <MushafScreen page={562} foot={false} />
        </Anim>
        <Anim t={t} box={StyleSheet.absoluteFill} style={(now) => {
          'worklet';
          const u = easeInOut(seg(now, 3.15, 3.95));
          return { opacity: now < 3.1 ? 0 : 1, transform: [{ translateX: (u - 1) * 412 }, { scale: 0.96 + 0.04 * u }] };
        }}>
          <MushafScreen
            page={563}
            under={
              <Anim t={t} box={[at(NEXT_WORD[0] - 3, first.top - 2, NEXT_WORD[1] - NEXT_WORD[0] + 6, first.height + 4), { backgroundColor: palette.highlight, borderRadius: 7 }]} style={(now) => {
                'worklet';
                const br = seg(now, 4.0, 7.0);
                return { opacity: seg(now, 4.0, 4.3), transform: [{ scale: 1 + 0.08 * Math.pow(Math.sin(br * Math.PI * 2.5), 2) }] };
              }} />
            }
          />
          <Anim t={t} box={StyleSheet.absoluteFill} style={(now) => {
            'worklet';
            return { opacity: 1 - easeInOut(seg(now, 4.25, 4.6)) };
          }}>
            <TakeBar top="1 mistake" sub="1:19 · Al-Mulk, 2nd page" score="98%" />
          </Anim>
          {/* Amber explains itself, once (RECITE-31). */}
          <Anim t={t} box={StyleSheet.absoluteFill} style={(now) => {
            'worklet';
            return { opacity: easeInOut(seg(now, 4.25, 4.6)) };
          }}>
            <TakeBar score="98%" line="Amber: a wrong haraka or letter, or not clear. Tap a mark to see." />
          </Anim>
        </Anim>
      </Screen>
    </>
  );
}

// ------------------------------------------------------------------ 5. A spot test (RECITE-8, ACT-34)
/**
 * Page 562 hidden as Recite hides it (RECITE-20): each line covered in the page's own colour with a rule under it, its
 * ayah markers and the surah's header left open. A light jumps from marker to marker, slowing like a wheel, and stops on
 * Al-Mulk 1's: the test starts at the next ayah, whose words show as they're said.
 */
const HOP_PATH = [8, 4, 10, 2, 11, 5, 3, 0];
/** When each jump starts (one fewer than the markers it visits); each takes most of the gap to the next, the last 0.34 s. */
const HOPS = [1.3, 1.44, 1.6, 1.79, 2.02, 2.3, 2.62];
const LAST_HOP = 0.34;
/** The light: a ring with a see-through grey wash, over the covers, so the marker's number shows through it. */
const LIGHT = 46;
/** Al-Mulk 2's words, in the order said: the end of line 3, then line 4 (bounds space). */
const TEST_WORDS: [number, number, number][] = [
  [3, 135.1, 212.5],
  [3, 62.3, 133.9],
  ...[
    [870, 977.1],
    [757.8, 869.6],
    [645.9, 757.8],
    [562.8, 642.3],
    [467.1, 562.8],
    [395, 467.1],
    [327.3, 395],
    [241.8, 327.3],
    [136.8, 241.8],
  ].map(([a, b]) => [4, a, b] as [number, number, number]),
];
const SAY_FROM = 3.2;
const SAY_STEP = 0.19;

/** A line's covers: its text with the markers taken out (the phone's points). */
function coverSpans(left: number, right: number, markers: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  let x = left;
  for (const [a, b] of [...markers].sort((m, n) => m[0] - n[0])) {
    if (a > x) out.push([x, a]);
    x = Math.max(x, b);
  }
  if (right > x) out.push([x, right]);
  return out;
}

export function SpotSlide({ t }: { t: Clock }) {
  const { palette, isDark } = useTheme();
  const pageBg = getReadPalette(isDark).pageBg;
  const place = (now: number): ScreenAt => {
    'worklet';
    return resting(now);
  };
  const lines = useMemo(() => linesOn(562), []);
  const marks = useMemo(() => lines.flatMap((l) => l.markers.map(([a, b]) => [(a + b) / 2, l.top + l.height / 2, b - a] as [number, number, number])), [lines]);
  const path = HOP_PATH.map((i) => marks[Math.min(i, marks.length - 1)]);
  /** Each word said: where its line's cover ends once it shows (the phone's points), and when. */
  const said = TEST_WORDS.map(([line, a], i) => ({ line, edge: wordX(a, a)[0], at: SAY_FROM + i * SAY_STEP }));
  const last = lines[lines.length - 1];
  return (
    <>
      <Screen t={t} place={place}>
        <MushafScreen page={562} foot={false} />
        {/* The covers: whole lines in the page's colour, the markers open; Al-Mulk 2's open word by word. */}
        {lines.map((l) =>
          coverSpans(l.left - 2, l.left + l.width + 2, l.markers).map(([x0, x1]) => {
            const mine = said.filter((w) => w.line === l.line && w.edge > x0 && w.edge < x1 + 1);
            const box = [at(x0, l.coverTop, x1 - x0, l.coverBottom - l.coverTop), { backgroundColor: pageBg, transformOrigin: 'left' as const }];
            if (mine.length === 0) return <View key={`${l.line}-${x0}`} style={box} />;
            return (
              <Anim key={`${l.line}-${x0}`} t={t} box={box} style={(now) => {
                'worklet';
                let edge = x1;
                for (const w of mine) edge = lerp(edge, Math.min(edge, w.edge), easeOut(seg(now, w.at, w.at + 0.16)));
                return { transform: [{ scaleX: Math.max(0.001, (edge - x0) / (x1 - x0)) }] };
              }} />
            );
          }),
        )}
        {/* Over and under each marker: covered, as Recite does (its own rows alone are open). */}
        {lines.flatMap((l) =>
          l.markers.flatMap(([a, b], m) => {
            const [r0, r1] = l.markerRows[m];
            return [
              <View key={`m-${l.line}-${m}-a`} style={[at(a, l.coverTop, b - a, Math.max(0, r0 - l.coverTop)), { backgroundColor: pageBg }]} />,
              <View key={`m-${l.line}-${m}-b`} style={[at(a, r1, b - a, Math.max(0, l.coverBottom - r1)), { backgroundColor: pageBg }]} />,
            ];
          }),
        )}
        {lines.map((l) => (
          <View key={`rule-${l.line}`} style={[at(l.left, l.coverBottom - 1, l.width, StyleSheet.hairlineWidth), { backgroundColor: palette.secondary, opacity: 0.35 }]} />
        ))}
        {/*
          The light jumps from marker to marker (an arc each time), slowing like a wheel, and lands on Al-Mulk 1's with a
          pulse. Over the covers, so it's always seen (Majd, Nov 27 2026: drawn under the page it was hidden, "u can barely
          see it"); its wash is see-through, so the marker shows through. It grows by its size, never a scale (sharp).
        */}
        <Anim t={t} box={[styles.light, { borderColor: palette.secondary }]} style={(now) => {
          'worklet';
          let k = -1;
          while (k + 1 < HOPS.length && now >= HOPS[k + 1]) k++;
          let x = path[0][0];
          let y = path[0][1];
          let lift = 0;
          if (k >= 0) {
            const dur = k + 1 < HOPS.length ? (HOPS[k + 1] - HOPS[k]) * 0.75 : LAST_HOP;
            const f = easeInOut(Math.min(1, (now - HOPS[k]) / dur));
            const a = path[k];
            const b = path[k + 1];
            x = lerp(a[0], b[0], f);
            y = lerp(a[1], b[1], f);
            lift = Math.sin(Math.PI * f) * Math.min(26, 10 + Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.08);
          }
          const landed = HOPS[HOPS.length - 1] + LAST_HOP;
          const d = LIGHT + 12 * bump(seg(now, landed, landed + 0.35));
          const o = now < 1.25 ? 0 : Math.min(1, (now - 1.25) * 6) * (1 - 0.55 * seg(now, SAY_FROM + 0.2, SAY_FROM + 0.8));
          return { opacity: o, left: x - d / 2, top: y - lift - d / 2, width: d, height: d, borderRadius: d / 2 };
        }}>
          <View style={[styles.lightWash, { backgroundColor: palette.text }]} />
        </Anim>
        {/* The line under the header fills from the right as the ayah is said. */}
        <View style={[at(0, 110, 402, 3), { backgroundColor: palette.separator }]}>
          <Anim t={t} box={[styles.fillRight, { backgroundColor: palette.primary }]} style={(now) => {
            'worklet';
            const u = easeInOut(seg(now, SAY_FROM - 0.1, SAY_FROM + TEST_WORDS.length * SAY_STEP));
            return { opacity: now > SAY_FROM - 0.15 ? 1 : 0, transform: [{ translateX: 201 * (1 - u) }, { scaleX: Math.max(0.001, u) }] };
          }} />
        </View>
        {/* Test me: one ayah at random, from everything memorized. */}
        <Anim t={t} box={StyleSheet.absoluteFill} style={(now) => {
          'worklet';
          const u = easeIn(seg(now, 1.0, 1.25));
          return { opacity: 1 - u, transform: [{ translateY: u * 260 }] };
        }}>
          <Sheet top={614}>
            <T style={[styles.sheetTitle, { color: palette.text }]}>Test me</T>
            <T style={[styles.body, styles.centerText, { color: palette.secondary }]}>1 page · Everything you’ve memorized</T>
            <View style={[styles.start, { backgroundColor: palette.primary }]}>
              <T style={[styles.button16, { color: palette.onPrimary }]}>Start</T>
            </View>
            <T style={[styles.meta, styles.centerText, { color: palette.secondary }]}>Test settings</T>
          </Sheet>
        </Anim>
        {/* Kept in Activity: the test lands as its own entry (ACT-34), under the page, clear of its words. */}
        <Anim t={t} box={at(16, Math.round(last.coverBottom + 14), 370)} style={(now) => {
          'worklet';
          const u = easeOut(seg(now, 5.5, 6.05));
          return { opacity: u, transform: [{ translateY: (1 - u) * 60 }] };
        }}>
          <View style={[styles.spotCard, { backgroundColor: palette.sheet }, isDark ? { borderWidth: StyleSheet.hairlineWidth, borderColor: palette.outline } : [styles.shadow, { shadowColor: palette.shadow }]]}>
            <View style={[styles.spotIcon, { backgroundColor: palette.accentSubtle }]}>
              <Ionicons name="shuffle-outline" size={20} color={palette.accentText} />
            </View>
            <View style={styles.flex}>
              <T style={[styles.name, { color: palette.text }]}>Spot test</T>
              <T style={[styles.meta, { color: palette.secondary }]}>Al-Mulk, 1st page · No mistakes</T>
            </View>
            <Ionicons name="checkmark-circle" size={26} color={palette.accentText} />
          </View>
        </Anim>
      </Screen>
    </>
  );
}

// ------------------------------------------------------------------ 6. Activity, in one place (ACT-35)
const NEW_WEEK_Y = 176 + ROW_H;
/** The picked day, a clear gap under the week's dates (Majd, Nov 27 2026: "the spacing is all off"), and Insights' rows. */
const DAY_TOP = 176 + 2 * ROW_H + 16;
const ROWS_TOP = DAY_TOP + 222;

export function ActivitySlide({ t }: { t: Clock }) {
  const { palette } = useTheme();
  const place = (now: number): ScreenAt => {
    'worklet';
    return resting(now);
  };
  const fold = (now: number) => {
    'worklet';
    return easeInOut(seg(now, 1.0, 2.15));
  };
  return (
    <Screen t={t} place={place}>
      <ActivityOldFrame />
      {/* The switch fades; the month folds into this week. */}
      <Anim t={t} box={at(91, 112, 220)} style={(now) => {
        'worklet';
        const u = fold(now);
        return { opacity: now > 2.6 ? 0 : 1 - u, transform: [{ scale: 1 - 0.2 * u }] };
      }}>
        <OverviewInsights />
      </Anim>
      {MONTH_ROWS.map((row, r) => (
        <Anim key={r} t={t} box={at(0, MONTH_TOP + r * ROW_H, 402, ROW_H)} style={(now) => {
          'worklet';
          const u = fold(now);
          const week = r === WEEK_ROW;
          const lift = week ? easeInOut(seg(now, 2.15, 2.6)) * (NEW_WEEK_Y - (MONTH_TOP + WEEK_ROW * ROW_H)) : 0;
          const o = now > 2.75 ? 0 : week ? 1 - seg(now, 2.5, 2.75) : Math.max(0, 1 - u * 1.25);
          return { opacity: o, transform: [{ translateY: (WEEK_ROW - r) * ROW_H * u + lift }] };
        }}>
          <MonthRow row={row} />
        </Anim>
      ))}
      {/* This week on top; the day slides up under it; Insights comes as rows. */}
      <Anim t={t} box={StyleSheet.absoluteFill} style={(now) => {
        'worklet';
        return { opacity: easeInOut(seg(now, 2.3, 2.7)) };
      }}>
        <ActivityWeek />
      </Anim>
      <Anim t={t} box={at(0, DAY_TOP, 402)} style={(now) => {
        'worklet';
        const u = easeOut(seg(now, 2.65, 3.1));
        return { opacity: u, transform: [{ translateY: (1 - u) * 34 }] };
      }}>
        <ActivityDay />
      </Anim>
      <Anim t={t} box={at(16, ROWS_TOP - 30, 370)} style={(now) => {
        'worklet';
        const u = easeOut(seg(now, 3.45, 3.9));
        return { opacity: u, transform: [{ translateY: (1 - u) * 18 }] };
      }}>
        <T style={[styles.eyebrow, { color: palette.secondary }]}>Your revision</T>
      </Anim>
      {INSIGHT_ROWS.map((row, i) => (
        <Anim key={row[0]} t={t} box={at(0, ROWS_TOP + i * 62, 402)} style={(now) => {
          'worklet';
          const a = 3.61 + i * 0.16;
          const u = easeOut(seg(now, a, a + 0.45));
          return { opacity: u, transform: [{ translateY: (1 - u) * 18 }] };
        }}>
          <InsightRow row={row} />
        </Anim>
      ))}
    </Screen>
  );
}

// ------------------------------------------------------------------ 7. A calmer Home (HOME-4, HOME-5, HOME-6, HOME-7)
/** Majd, Nov 26 2026: market the clean Home, with its glow, the ayah at its foot and Ramadan's decorations, unnamed. */
export function HomeSlide({ t }: { t: Clock }) {
  const { palette } = useTheme();
  const place = (now: number): ScreenAt => {
    'worklet';
    return resting(now);
  };
  const flyTo = (now: number, start: number, x: number, y: number, w: number, h: number, bow: number) => {
    'worklet';
    const k = easeInOut(seg(now, start, start + 0.85));
    const dx = TAB_X.activity - (x + w / 2);
    const dy = TAB_Y + 23 - (y + h / 2);
    const lift = easeOut(seg(now, 1.0, 1.25));
    return {
      opacity: now < 1.0 || k >= 1 ? 0 : 1,
      transform: k <= 0 ? [{ scale: 1 + 0.03 * lift }] : [{ translateX: dx * k + Math.sin(Math.PI * k) * bow }, { translateY: dy * k }, { scale: lerp(1, 0.06, easeIn(k)) }],
    };
  };
  const reveal = (now: number) => {
    'worklet';
    return easeInOut(seg(now, 2.7, 3.7));
  };
  return (
    <Screen t={t} place={place}>
      <HomeSketch v3={false} />
      {/* What isn't today lifts out: past sessions and the journal go to Activity, Add to today melts away. */}
      <Anim t={t} box={[at(0, 372, 402, 336), { backgroundColor: palette.bg }]} style={(now) => {
        'worklet';
        return { opacity: now > 1.0 ? 1 : 0 };
      }} />
      <Anim t={t} box={at(RECENT_AT.left, RECENT_AT.top, RECENT_AT.width)} style={(now) => {
        'worklet';
        return flyTo(now, 1.25, RECENT_AT.left, RECENT_AT.top, RECENT_AT.width, RECENT_AT.height, -40);
      }}>
        <RecentSessions placed={false} />
      </Anim>
      <Anim t={t} box={at(JOURNAL_AT.left, JOURNAL_AT.top, JOURNAL_AT.width)} style={(now) => {
        'worklet';
        return flyTo(now, 1.4, JOURNAL_AT.left, JOURNAL_AT.top, JOURNAL_AT.width, JOURNAL_AT.height, 24);
      }}>
        <JournalRow placed={false} />
      </Anim>
      <Anim t={t} box={at(68, 226)} style={(now) => {
        'worklet';
        const k = easeInOut(seg(now, 1.6, 2.3));
        return { opacity: now > 1.0 && k < 1 ? 1 - k : 0, transform: [{ scaleX: 1 - 0.3 * k }, { scaleY: 1 - 0.7 * k }] };
      }}>
        <AddToTodayButton />
      </Anim>
      <Ripple t={t} color={palette.primary} r={24} width={1.5} where={(now) => {
        'worklet';
        return [TAB_X.activity, TAB_Y + 23, seg(now, 2.15, 2.65)];
      }} />
      {/* The calmer Home washes in from the top, its glow carried down. */}
      <Anim t={t} box={[StyleSheet.absoluteFill, styles.window]} style={(now) => {
        'worklet';
        return { opacity: now < 2.7 ? 0 : 1, transform: [{ translateY: -(1 - reveal(now)) * 874 }] };
      }}>
        <Anim t={t} box={StyleSheet.absoluteFill} style={(now) => {
          'worklet';
          return { transform: [{ translateY: (1 - reveal(now)) * 874 }] };
        }}>
          <HomeSketch
            v3
            clean
            foot={
              // An ayah at its foot, one a day (HOME-7).
              <Anim t={t} style={(now) => {
                'worklet';
                const a = easeOut(seg(now, 3.9, 4.8));
                return { opacity: a, transform: [{ translateY: (1 - a) * 18 }] };
              }}>
                <HomeAyah />
              </Anim>
            }
          />
        </Anim>
      </Anim>
      <Glint t={t} color={palette.primary} size={18} where={(now) => {
        'worklet';
        return [201, 562, seg(now, 4.5, 5.1)];
      }} />
      {/* One solid button: a light passes over it (HOME-5). */}
      <View style={[at(70, 200, 124, 33), styles.shine]}>
        <Anim t={t} box={[at(0, -14, 26, 62), { backgroundColor: palette.onPrimary }]} style={(now) => {
          'worklet';
          const s = seg(now, 5.2, 5.9);
          return { opacity: s > 0 && s < 1 ? 0.55 : 0, transform: [{ translateX: -30 + s * 180 }, { rotate: '20deg' }] };
        }} />
      </View>
    </Screen>
  );
}

// ------------------------------------------------------------------ 8. Unlock your next badge (ACCOUNT-4 to ACCOUNT-8)
const STEPS = [0, 1, 2, 3, 4, 5].map((i) => [78 + i * 49.2, 600 - i * 96] as const);
const TIER_TOPS = CLIMB_TOPS as readonly Milestone[];
/** When the climbing badge lands on Maryam's picture on Home (the end of its flight in climbAt). */
const LANDED = 8.15;
const RING_C = 2 * Math.PI * 51;

function CountLine({ t }: { t: Clock }) {
  const { palette } = useTheme();
  const [shown, setShown] = useState({ n: 10, tier: 0 });
  useAnimatedReaction(
    () => {
      const c = along(t.value, [4.25, 0, 6.95, 5]);
      const i = Math.min(5, Math.floor(c));
      const hop = easeInOut(Math.min(1, (c - i) / 0.55));
      const n = t.value < 4.25 ? Math.round(lerp(10, 50, seg(t.value, 3.95, 4.25))) : climbCount(i, hop);
      return n * 10 + (i < 5 && hop > 0.5 ? i + 1 : i);
    },
    (v, prev) => {
      if (v !== prev) runOnJS(setShown)({ n: Math.floor(v / 10), tier: v % 10 });
    },
  );
  return (
    <View style={[at(178, 610, 200), styles.endCol]}>
      <T style={[styles.counter, { color: palette.text }]}>{formatNumber(shown.n)}</T>
      <T style={[styles.meta, { color: palette.secondary }]}>{`pages revised · ${badgeName(TIER_TOPS[shown.tier])}`}</T>
    </View>
  );
}

function badgeName(m: Milestone): string {
  const { tier } = badgeOf(m);
  return `${tier[0].toUpperCase()}${tier.slice(1)} ${MILESTONES.indexOf(m) % 2 === 0 ? 'I' : 'II'}`;
}

function BigBadge({ t }: { t: Clock }) {
  const [tier, setTier] = useState(0);
  useAnimatedReaction(
    () => {
      const c = along(t.value, [4.25, 0, 6.95, 5]);
      const i = Math.min(5, Math.floor(c));
      const hop = easeInOut(Math.min(1, (c - i) / 0.55));
      return i < 5 && hop > 0.5 ? i + 1 : i;
    },
    (v, prev) => {
      if (v !== prev) runOnJS(setTier)(v);
    },
  );
  const light = BADGE_MATERIALS[badgeOf(TIER_TOPS[tier]).tier].light;
  return (
    <>
      <Svg width={160} height={160} style={styles.halo}>
        <Defs>
          <RadialGradient id="tourHalo" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={light} stopOpacity={0.75} />
            <Stop offset="0.68" stopColor={light} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={80} cy={80} r={80} fill="url(#tourHalo)" />
      </Svg>
      <View style={styles.bigBadge}>
        <BadgeMark milestone={TIER_TOPS[tier]} size={92} />
      </View>
    </>
  );
}

export function BadgesSlide({ t }: { t: Clock }) {
  const { palette } = useTheme();
  const stage = useStage();
  const account = (now: number): ScreenAt => {
    'worklet';
    const e = resting(now);
    const out = easeInOut(seg(now, 3.85, 4.25));
    return { ...e, scale: lerp(e.scale ?? SCREEN_AT.scale, 0.6, out), opacity: (e.opacity ?? 1) * (1 - out) };
  };
  const home = (now: number): ScreenAt => {
    'worklet';
    const g = easeOut(seg(now, 7.25, 7.7));
    // The whole of Home, never a crop of it (Majd, Nov 27 2026: a zoom cut its words off at the screen's edge).
    return { scale: lerp(0.66, SCREEN_AT.scale, g), top: lerp(80, SCREEN_AT.top, g), opacity: easeOut(seg(now, 7.25, 7.6)) };
  };
  const climbAt = (now: number): [number, number, number] => {
    'worklet';
    const c = along(now, [4.25, 0, 6.95, 5]);
    const i = Math.min(5, Math.floor(c));
    const hop = easeInOut(Math.min(1, (c - i) / 0.55));
    const [x0, y0] = STEPS[i];
    const [x1, y1] = STEPS[Math.min(5, i + 1)];
    let x = i < 5 ? lerp(x0, x1, hop) : x0;
    let y = i < 5 ? lerp(y0, y1, hop) - Math.sin(Math.PI * hop) * 22 : y0;
    let s = i < 5 ? 1 + 0.14 * bump(Math.max(0, (hop - 0.5) * 2)) : 1;
    const land = easeInOut(seg(now, 7.45, 8.15));
    if (now > 7.45) {
      const f = home(now);
      const tg = pointOn(f, TODAY_BADGE.x, TODAY_BADGE.y);
      const p = curve([x, y], [x + 120, Math.min(y, tg[1]) - 40], tg, land);
      x = p[0];
      y = p[1];
      s *= lerp(1, (18 / 92) * (f.scale ?? 1) * (f.zoom ?? 1), land);
    }
    return [x, y, s];
  };
  const ring = useAnimatedProps(() => ({ strokeDashoffset: RING_C * (1 - easeInOut(seg(t.value, 1.45, 2.35))) }));
  return (
    <>
      {/* Account opens on the first letter; a tap on the picture; the photo drops in and Premium's ring draws round it. */}
      <Screen t={t} place={account}>
        <AccountSketch state="first" photo={false} />
        <Anim t={t} box={StyleSheet.absoluteFill} style={(now) => {
          'worklet';
          return { opacity: now > 1.2 ? 1 : 0 };
        }}>
          <AccountSketch state="midway" photo={false} />
          <View style={[at(ACCOUNT_PICTURE.x - 54, ACCOUNT_PICTURE.y - 54, 108, 108), { backgroundColor: palette.bg, borderRadius: 54 }]} />
          <Svg width={108} height={108} style={at(ACCOUNT_PICTURE.x - 54, ACCOUNT_PICTURE.y - 54)}>
            <Defs>
              <LinearGradient id="tourRingDraw" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor={palette.ring[0]} />
                <Stop offset="1" stopColor={palette.ring[1]} />
              </LinearGradient>
            </Defs>
            <AnimatedCircle cx={54} cy={54} r={51} stroke="url(#tourRingDraw)" strokeWidth={3} fill="none" strokeDasharray={[RING_C, RING_C]} animatedProps={ring} transform="rotate(-90 54 54)" />
          </Svg>
          <Anim t={t} box={[at(ACCOUNT_PICTURE.x - 48, ACCOUNT_PICTURE.y - 48, 96, 96), { borderRadius: 48, overflow: 'hidden' }]} style={(now) => {
            'worklet';
            const d = easeOut(seg(now, 1.25, 1.75));
            return { opacity: Math.min(1, d * 1.4), transform: [{ translateY: (1 - d) * -40 }] };
          }}>
            <ExamplePhoto size={96} />
          </Anim>
        </Anim>
        {/* The bar fills to its end and the next badge pops, with its halo. */}
        <Anim t={t} box={[at(ACCOUNT_BAR.left, ACCOUNT_BAR.y - 3, ACCOUNT_BAR.right - ACCOUNT_BAR.left, 6), { backgroundColor: palette.accentText, borderRadius: 3 }]} style={(now) => {
          'worklet';
          const k = lerp(0.68, 1, easeInOut(seg(now, 2.45, 3.05)));
          const w = ACCOUNT_BAR.right - ACCOUNT_BAR.left;
          return { opacity: now > 2.45 && now < 3.1 ? 1 : 0, transform: [{ translateX: -(1 - k) * w * 0.5 }, { scaleX: k }] };
        }} />
        <Anim t={t} box={StyleSheet.absoluteFill} style={(now) => {
          'worklet';
          return { opacity: easeInOut(seg(now, 3.05, 3.25)) };
        }}>
          <AccountSketch state="crossed" photo />
        </Anim>
        <Anim t={t} box={at(ACCOUNT_BAR.left - 44, ACCOUNT_BAR.y - 16)} style={(now) => {
          'worklet';
          const k = seg(now, 3.1, 3.6);
          return { opacity: k > 0 && k < 1 ? 1 : 0, transform: [{ scale: k > 0 ? lerp(0.5, 1, easeBack(k)) : 1 }] };
        }}>
          <BadgeMark milestone={100} size={32} />
        </Anim>
        <Glint t={t} color={SPARK} size={16} where={(now) => {
          'worklet';
          return [ACCOUNT_BAR.left - 16, ACCOUNT_BAR.y - 18, seg(now, 3.3, 3.8)];
        }} />
      </Screen>
      <OnStage>
      {/* The climb: the badge rises up the six tiers, changing shape and metal at each, the count rolling with it. */}
      <Anim t={t} box={StyleSheet.absoluteFill} style={(now) => {
        'worklet';
        return { opacity: now < 7.25 ? seg(now, 3.95, 4.25) : 1 - seg(now, 7.25, 7.55) };
      }}>
        <Svg width={402} height={690} style={StyleSheet.absoluteFill}>
          <Path d={`M${STEPS.map((s) => s.join(',')).join(' ')}`} fill="none" stroke={palette.secondary} strokeOpacity={0.6} strokeWidth={1.5} strokeDasharray="3 6" strokeLinecap="round" />
        </Svg>
        {STEPS.map(([x, y], i) => (
          <React.Fragment key={i}>
            <View style={at(x - 20, y - 20)}>
              <BadgeMark milestone={TIER_TOPS[i]} size={40} locked />
            </View>
            <Anim t={t} box={at(x - 20, y - 20)} style={(now) => {
              'worklet';
              const c = along(now, [4.25, 0, 6.95, 5]);
              return { opacity: c >= i + 0.5 ? 1 : 0 };
            }}>
              <BadgeMark milestone={TIER_TOPS[i]} size={40} />
            </Anim>
            {/* Clear of the climbing badge (92 across, with its halo), so it never sits on a tier's words. */}
            <View style={[at(i < 3 ? x + 58 : x - 58 - 160, y - 19, 160), i < 3 ? null : styles.endCol]}>
              <T style={[styles.name, { color: palette.text }]}>{badgeOf(TIER_TOPS[i]).tier[0].toUpperCase() + badgeOf(TIER_TOPS[i]).tier.slice(1)}</T>
              <T style={[styles.meta, { color: palette.secondary }]}>{`${milestoneLabel(MILESTONES[2 * i])} · ${milestoneLabel(TIER_TOPS[i])} pages`}</T>
            </View>
          </React.Fragment>
        ))}
        <CountLine t={t} />
      </Anim>
      </OnStage>
      {/* The badge with its number: the stage's scale goes into its own, so its number stays crisp. */}
      <Anim t={t} box={at(0, 0, 160, 160)} style={(now) => {
        'worklet';
        const [x0, y0, s] = climbAt(now);
        const k = stage ? stage.value : 1;
        const [x, y] = stageAt(x0, y0, k);
        return { opacity: now < 4.0 ? 0 : now < 8.2 ? Math.min(1, (now - 4.0) * 4) : 1 - seg(now, 8.2, 8.35), transform: [{ translateX: x - 80 }, { translateY: y - 80 }, { scale: s * k }] };
      }}>
        <BigBadge t={t} />
      </Anim>
      <OnStage>
      {[0, 1, 2, 3, 4].map((k) => (
        <Glint key={k} t={t} color={BADGE_MATERIALS.gold.deep} size={[14, 12, 10, 12, 9][k]} where={(now) => {
          'worklet';
          const [x0, y0] = STEPS[5];
          const d = [[-58, -34], [54, 40], [-40, 52], [8, -66], [66, -46]][k];
          const on = now > 6.95 && now < 7.3;
          return [x0 + d[0], y0 + d[1], on ? (((now - 6.95) * 1.3 + k * 0.19) % 1) : 0];
        }} />
      ))}
      </OnStage>
      {/*
        The latest badge flies down to Home and clicks into the corner of Maryam's picture: her Silver gives way to Emerald
        (Majd, Nov 27 2026: "it should update maryams badge to emerald").
      */}
      <Screen t={t} place={home}>
        <HomeSketch v3 photo />
        <Anim t={t} box={at(TODAY_BADGE.x - 10.5, TODAY_BADGE.y - 10.5, 21, 21)} style={(now) => {
          'worklet';
          const k = seg(now, LANDED - 0.03, LANDED + 0.4);
          return { opacity: now > LANDED - 0.03 ? 1 : 0, transform: [{ scale: lerp(2.1, 1, easeBack(k)) }] };
        }}>
          <TodayBadge milestone={TIER_TOPS[TIER_TOPS.length - 1]} placed={false} />
        </Anim>
        <Ripple t={t} color={palette.accentText} r={16} where={(now) => {
          'worklet';
          return [TODAY_BADGE.x, TODAY_BADGE.y, seg(now, LANDED, LANDED + 0.65)];
        }} />
        <Glint t={t} color={SPARK} size={18} where={(now) => {
          'worklet';
          return [TODAY_BADGE.x + 9, TODAY_BADGE.y - 9, seg(now, LANDED + 0.02, LANDED + 0.5)];
        }} />
      </Screen>
    </>
  );
}

// ------------------------------------------------------------------ 9. Ready for Ramadan (THEME-1, THEME-5 to THEME-8)
/**
 * One day in Ramadan, all on the phone (Majd, Nov 27 2026: "the ramadan slide doesn't even make sense like ur zooming into
 * a random moon then all of a sudden showing ur revision is complete"): Home dresses itself for the month; Revo greets
 * with Ramadan's suggestions; the revision's end card has gold light for confetti and the day of Ramadan; Activity, with
 * its lanterns, lights today's moon.
 */
const MONTH_DAYS = 30;
const TODAY = 12;
const MOTES = 18;
/** Revo's button on Home (HomeSketch) and Start revision's middle, for the taps. */
const REVO_AT = { x: 340, y: 728, size: 44 } as const;
const START_AT = [130, 216] as const;
const RAMADAN_ROW_TOP = DAY_TOP + 186;

/** A lantern hanging from the top bar's wire, dropping in at `at` and swinging to rest (or still, with `at` null). */
function HangingLantern({ t, x, i, at: start }: { t: Clock; x: number; i: number; at: number }) {
  const { palette, isDark } = useTheme();
  const tokens = ramadanV2(isDark, palette.accent);
  const rope = 10 + (i % 2) * 6;
  return (
    <Anim t={t} box={[at(x - 8, 56, 16, rope + 34), styles.lantern]} style={(now) => {
      'worklet';
      const d0 = start + i * 0.12;
      const dk = easeOut(seg(now, d0, d0 + 0.55));
      const tau = Math.max(0, now - d0 - 0.45);
      const amp = 9 * (i % 2 ? 1 : -1);
      const ang = now < d0 + 0.45 ? amp * 0.4 : amp * Math.exp(-1.6 * tau) * Math.sin(5.2 * tau + 1.2) + 1.2 * Math.sin(1.3 * now + i);
      return { opacity: dk > 0 ? 1 : 0, transform: [{ translateY: (1 - dk) * -110 }, { rotate: `${ang}deg` }] };
    }}>
      <View style={[styles.rope, { height: rope, backgroundColor: tokens.wire }]} />
      <Lantern height={30} tokens={tokens} />
    </Anim>
  );
}

/** Light falling softly over a screen from `from` (THEME-1), between `top` and `bottom`. */
function FallingLight({ t, from, until = 99, top, bottom }: { t: Clock; from: number; until?: number; top: number; bottom: number }) {
  const { palette, isDark } = useTheme();
  const tokens = ramadanV2(isDark, palette.accent);
  const motes = useMemo(
    () => Array.from({ length: MOTES }, (_, i) => ({ x: 14 + ((i * 71) % 374), y: (i * 137) % (bottom - top), v: 24 + ((i * 13) % 30), s: 2 + (i % 3), w: i * 0.7 })),
    [top, bottom],
  );
  return (
    <>
      {motes.map((m, i) => (
        <Anim key={i} t={t} box={[at(0, 0, m.s, m.s), { borderRadius: m.s, backgroundColor: tokens.mote }]} style={(now) => {
          'worklet';
          const y = top + ((m.y + m.v * now) % (bottom - top));
          const o = now < from || now > until ? 0 : seg(now, from, from + 0.5) * (1 - seg(now, until - 0.3, until)) * tokens.moteOpacity;
          return { opacity: o, transform: [{ translateX: m.x + Math.sin(now + m.w) * 6 }, { translateY: y }] };
        }} />
      ))}
    </>
  );
}

/** Revo, opened from Home in Ramadan (THEME-8): its greeting and Ramadan's suggestions. */
function RamadanRevo() {
  const { palette } = useTheme();
  return (
    <Sheet top={330}>
      <RevoHeader />
      <View style={styles.sayGap}>
        <T style={[styles.say, { color: palette.text }]}>
          Ramadan Kareem, Maryam. Day 12, and you’ve revised every day so far. Today’s 20 pages start at Al-Mulk.
        </T>
      </View>
      <View style={styles.chipsCol}>
        {['Plan a khatmah by Eid', 'What should I revise for taraweeh?', 'How’s my Ramadan going?'].map((c) => (
          <View key={c} style={[styles.chip, { borderColor: palette.outline }]}>
            <T style={[styles.button, { color: palette.text }]} numberOfLines={1}>
              {c}
            </T>
          </View>
        ))}
      </View>
    </Sheet>
  );
}

/** A revision's end card in Ramadan (THEME-7): gold light falling and a pair of lanterns at each top corner. */
function RamadanEndCard({ t }: { t: Clock }) {
  const { palette, isDark } = useTheme();
  const tokens = ramadanV2(isDark, palette.accent);
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.bg }]}>
      {[
        [34, 70],
        [66, 40],
        [336, 40],
        [368, 70],
      ].map(([x, rope], i) => (
        <View key={i} style={[at(x - 10, 0, 20, rope + 40), styles.centerCol]}>
          <View style={[styles.rope, { height: rope, backgroundColor: tokens.wire }]} />
          <Lantern height={38} tokens={tokens} />
        </View>
      ))}
      <FallingLight t={t} from={4.8} top={120} bottom={780} />
      <View style={[StyleSheet.absoluteFill, styles.centerCol, { justifyContent: 'center' }]}>
        <View style={[styles.doneRing, { borderColor: palette.accentText }]}>
          <Ionicons name="checkmark" size={30} color={palette.accentText} />
        </View>
        <T style={[styles.title22, { color: palette.text, marginTop: 16 }]}>Revision complete</T>
        <T style={[styles.body, { color: palette.secondary }]}>Al-Mulk to Al-Mursalat</T>
        <T style={[styles.meta, { color: palette.secondary }]}>20 pages revised today</T>
        <View style={styles.dayLine}>
          <Crescent size={14} tokens={tokens} />
          <T style={[styles.name13, { color: tokens.gold }]}>Day 12 of Ramadan</T>
        </View>
      </View>
    </View>
  );
}

/** The one Activity tab in Ramadan (THEME-5, THEME-6): its lanterns, the day, and the month's row with a moon a day. */
function RamadanActivity({ t }: { t: Clock }) {
  const { palette, isDark } = useTheme();
  const tokens = ramadanV2(isDark, palette.accent);
  const moon = (d: number, state: 'lit' | 'ahead') => <Moon size={18} day={d} state={state} tokens={tokens} missed={palette.red} ahead={palette.track} />;
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.bg }]}>
      {/* Light falls softly behind this week (THEME-5): under its words. */}
      <FallingLight t={t} from={6.1} top={110} bottom={280} />
      <ActivityWeek bare />
      {HOME_LANTERNS.map((x, i) => (
        <View key={x} style={[at(x - 8, 56, 16, 50), styles.centerCol]}>
          <View style={[styles.rope, { height: 10 + (i % 2) * 6, backgroundColor: tokens.wire }]} />
          <Lantern height={30} tokens={tokens} />
        </View>
      ))}
      {TAB_BULBS.map(([x, y], i) => (
        <View key={i} style={[at(x, y, 6, 6), { borderRadius: 3, backgroundColor: tokens.bulbs[i % 3] }]} />
      ))}
      <View style={at(0, DAY_TOP, 402)}>
        <ActivityDay />
      </View>
      <View style={at(16, RAMADAN_ROW_TOP, 370)}>
        <View style={styles.ramadanHead}>
          <Crescent size={16} tokens={tokens} />
          <T style={[styles.name, { color: palette.text }]}>Day 12 of Ramadan</T>
          <View style={styles.flex} />
          <T style={[styles.meta, { color: palette.secondary }]}>12 of 12 days</T>
        </View>
        <T style={[styles.meta, { color: palette.secondary }]}>Every day so far</T>
        {[0, 1].map((row) => (
          <View key={row} style={styles.moons}>
            {Array.from({ length: MONTH_DAYS / 2 }, (_, k) => {
              const d = row * (MONTH_DAYS / 2) + k + 1;
              if (d !== TODAY) return <View key={d}>{moon(d, d < TODAY ? 'lit' : 'ahead')}</View>;
              // Today's moon, lit as the day's revision lands.
              return (
                <View key={d}>
                  {moon(d, 'ahead')}
                  <Anim t={t} box={StyleSheet.absoluteFill} style={(now) => {
                    'worklet';
                    const u = seg(now, 6.85, 7.25);
                    return { opacity: u, transform: [{ scale: 1 + 0.5 * bump(u) }] };
                  }}>
                    {moon(d, 'lit')}
                  </Anim>
                </View>
              );
            })}
          </View>
        ))}
      </View>
      <View style={at(16, RAMADAN_ROW_TOP + 120, 370)}>
        <T style={[styles.eyebrow, { color: palette.secondary }]}>Your revision</T>
      </View>
      {INSIGHT_ROWS.slice(0, 2).map((row, i) => (
        <View key={row[0]} style={at(0, RAMADAN_ROW_TOP + 148 + i * 62, 402)}>
          <InsightRow row={row} />
        </View>
      ))}
    </View>
  );
}

export function RamadanSlide({ t }: { t: Clock }) {
  const { palette, isDark } = useTheme();
  const tokens = ramadanV2(isDark, palette.accent);
  const place = (now: number): ScreenAt => {
    'worklet';
    return resting(now);
  };
  // Today's moon on the Activity tab (its place in the month's rows), for its glint.
  const moonX = 16 + ((TODAY - 1) % (MONTH_DAYS / 2)) * (18 + (370 - (MONTH_DAYS / 2) * 18) / (MONTH_DAYS / 2 - 1)) + 9;
  const moonY = RAMADAN_ROW_TOP + 20 + 18 + 10 + 9;
  return (
    <Screen t={t} place={place}>
      {/* Home, then dressed for the month: the crescent by the greeting, lanterns, the tab bar's lights, falling light. */}
      <HomeSketch
        v3
        clean
        photo
        decor={false}
        greetingEnd={
          <Anim t={t} style={(now) => {
            'worklet';
            const u = easeOut(seg(now, 0.8, 1.2));
            return { opacity: u, transform: [{ scale: lerp(0.4, 1, easeBack(u)) }] };
          }}>
            <Crescent size={17} tokens={tokens} />
          </Anim>
        }
      />
      <Glint t={t} color={tokens.gold} size={14} where={(now) => {
        'worklet';
        return [262, 76, seg(now, 1.0, 1.5)];
      }} />
      <Anim t={t} box={[at(0, 56, 402, 2), { backgroundColor: tokens.wire }]} style={(now) => {
        'worklet';
        return { opacity: 0.6 * easeOut(seg(now, 0.9, 1.2)) };
      }} />
      {HOME_LANTERNS.map((x, i) => (
        <HangingLantern key={x} t={t} x={x} i={i} at={1.0} />
      ))}
      {TAB_BULBS.map(([x, y], i) => (
        <Anim key={i} t={t} box={[at(x - 5, y - 5, 16, 16), styles.centerCol, { justifyContent: 'center' }]} style={(now) => {
          'worklet';
          const lit = seg(now, 1.35 + i * 0.07, 1.42 + i * 0.07);
          return { opacity: lit };
        }}>
          <View style={[styles.bulbHalo, { backgroundColor: tokens.bulbs[i % 3] }]} />
          <View style={[styles.bulb, { backgroundColor: tokens.bulbs[i % 3] }]} />
        </Anim>
      ))}
      <FallingLight t={t} from={1.6} until={4.7} top={110} bottom={780} />
      {/* Revo's button takes its crescent; a tap, and it greets the month with Ramadan's suggestions (THEME-8). */}
      <Anim t={t} box={at(REVO_AT.x - 4, REVO_AT.y - 5, 15, 15)} style={(now) => {
        'worklet';
        const u = easeOut(seg(now, 2.1, 2.45));
        return { opacity: u, transform: [{ scale: lerp(0.4, 1, easeBack(u)) }] };
      }}>
        <Crescent size={15} tokens={tokens} />
      </Anim>
      <Ripple t={t} color={palette.primary} r={30} where={(now) => {
        'worklet';
        return [REVO_AT.x + REVO_AT.size / 2, REVO_AT.y + REVO_AT.size / 2, seg(now, 2.55, 3.0)];
      }} />
      <Anim t={t} box={StyleSheet.absoluteFill} style={(now) => {
        'worklet';
        const up = easeOut(seg(now, 2.8, 3.25));
        const down = easeIn(seg(now, 4.15, 4.45));
        return { opacity: now < 2.8 ? 0 : 1 - down, transform: [{ translateY: (1 - up) * 560 + down * 560 }] };
      }}>
        <RamadanRevo />
      </Anim>
      {[0, 1, 2].map((k) => (
        <Glint key={k} t={t} color={tokens.gold} size={[12, 9, 11][k]} where={(now) => {
          'worklet';
          const on = now > 3.3 && now < 4.1;
          return [[60, 84, 104][k], [372, 362, 376][k], on ? ((now - 3.3) * 1.25 + k * 0.3) % 1 : 0];
        }} />
      ))}
      {/* Start revision; at its end, gold light where the confetti was, and the day of Ramadan (THEME-7). */}
      <Ripple t={t} color={palette.onPrimary} r={26} where={(now) => {
        'worklet';
        return [START_AT[0], START_AT[1], seg(now, 4.5, 4.95)];
      }} />
      <Anim t={t} box={StyleSheet.absoluteFill} style={(now) => {
        'worklet';
        return { opacity: easeInOut(seg(now, 4.75, 5.05)) * (1 - easeInOut(seg(now, 6.0, 6.3))) };
      }}>
        <RamadanEndCard t={t} />
      </Anim>
      {/* Activity, with its lanterns: today's moon lights (THEME-5, THEME-6). */}
      <Anim t={t} box={StyleSheet.absoluteFill} style={(now) => {
        'worklet';
        const u = easeInOut(seg(now, 6.0, 6.35));
        return { opacity: u, transform: [{ translateX: (1 - u) * 60 }] };
      }}>
        <RamadanActivity t={t} />
      </Anim>
      <Glint t={t} color={tokens.gold} size={18} where={(now) => {
        'worklet';
        return [moonX + 8, moonY - 10, seg(now, 7.0, 7.6)];
      }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centerCol: { alignItems: 'center' },
  centerText: { textAlign: 'center' },
  endCol: { alignItems: 'flex-end' },
  name: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  name13: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 20 },
  meta: { fontSize: 13, lineHeight: 18 },
  tiny: { fontSize: 11, lineHeight: 14 },
  button: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  button16: { fontSize: 16, lineHeight: 21, fontWeight: '600' },
  title22: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  sheetTitle: { fontSize: 18, lineHeight: 24, fontWeight: '600', textAlign: 'center', marginVertical: 10 },
  eyebrow: { fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase' },
  menuText: { fontSize: 15, lineHeight: 20 },
  counter: { fontSize: 38, lineHeight: 44, fontWeight: '800', letterSpacing: -1.2, fontVariant: ['tabular-nums'] },
  say: { fontSize: 17, lineHeight: 24 },
  sayGap: { marginTop: 14 },
  capsule: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 26, borderWidth: StyleSheet.hairlineWidth, paddingStart: 16, paddingEnd: 6 },
  scorePill: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 8, paddingVertical: 2 },
  micButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  stop: { width: 12, height: 12, borderRadius: 2 },
  marker: { borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  fillRight: { position: 'absolute', left: 0, top: 0, width: 402, height: 3 },
  light: { position: 'absolute', left: 0, top: 0, borderWidth: 2.5, overflow: 'hidden' },
  lightWash: { ...StyleSheet.absoluteFillObject, opacity: 0.26 },
  start: { height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginTop: 16, marginBottom: 12 },
  miniRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, height: 39 },
  shadow: { shadowOpacity: 0.16, shadowRadius: 12, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  shine: { borderRadius: 17, overflow: 'hidden' },
  window: { overflow: 'hidden' },
  spotCard: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 16 },
  spotIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', left: 0, top: 0 },
  bigBadge: { position: 'absolute', left: 34, top: 34 },
  ramadanHead: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 20 },
  moons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  chipsCol: { gap: 8, alignItems: 'flex-start', marginTop: 'auto', marginBottom: 48 },
  dayLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  chip: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8 },
  doneRing: { width: 64, height: 64, borderRadius: 32, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
  bulb: { position: 'absolute', width: 6.4, height: 6.4, borderRadius: 3.2 },
  bulbHalo: { position: 'absolute', width: 16, height: 16, borderRadius: 8, opacity: 0.16 },
  lantern: { alignItems: 'center', transformOrigin: 'top' },
  rope: { width: 1.2 },
});
