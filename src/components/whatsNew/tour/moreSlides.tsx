// The tour's other slides (What's new 1.0.6, lib/whatsNew/tour): 4. Recite keeps up (RECITE-30, RECITE-2, RECITE-31);
// 5. Spot test yourself (RECITE-8, ACT-34); 6. Activity, in one place (ACT-35); 7. A calmer Home (HOME-4 to 7); 8. Unlock your next badge (ACCOUNT-4 to 8); 9. Ready for Ramadan (THEME-2 to 8). Pictures, never touched.

import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { runOnJS, useAnimatedProps, useAnimatedReaction } from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../context/ThemeContext';
import { BadgeMark } from '../../account/BadgeMark';
import { Crescent, Lantern, Moon } from '../../ramadan/art';
import { badgeOf, MILESTONES, milestoneLabel, type Milestone } from '../../../lib/badges';
import { arabicV2, BADGE_MATERIALS, ramadanV2 } from '../../../theme/v2';
import { getReadPalette } from '../../../theme/readPalette';
import { TAKE } from '../pictures';
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
import { LINE_H, MushafScreen, PAGE_BOX, WordsIn } from './screens';
import {
  ACCOUNT_BAR,
  ACCOUNT_PICTURE,
  AccountSketch,
  ActivityDay,
  ActivityOldFrame,
  ActivityWeek,
  AddToTodayButton,
  ExamplePhoto,
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
  TAB_Y,
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
const LAST_LINE = PAGE_BOX.top + 14 * LINE_H;
/** The page's last line, word by word from the right (rough places: a picture, not the page's word boxes). */
const STEPS_X = [330, 272, 214, 160, 104, 50];

export function ReciteUpSlide({ t }: { t: Clock }) {
  const { palette } = useTheme();
  const place = (now: number): ScreenAt => {
    'worklet';
    return resting(now, along(now, [1.55, 1, 2.2, 1.4, 2.75, 1.4, 3.1, 1]), 200, 726);
  };
  const box = (now: number) => {
    'worklet';
    if (now < 1.9) {
      const v = seg(now, 0.25, 1.65) * 3;
      const i = Math.min(2, Math.floor(v));
      return lerp(STEPS_X[i], STEPS_X[i + 1], easeBack(Math.min(1, (v - i) * 2.2)));
    }
    return lerp(STEPS_X[3], STEPS_X[5], easeBack(seg(now, 1.9, 2.15)));
  };
  return (
    <>
      <Screen t={t} place={place}>
        {/* Following the page's last ayah: the soft band on the line, the grey box from word to word. */}
        <Anim t={t} box={StyleSheet.absoluteFill} style={(now) => {
          'worklet';
          return { opacity: now < 3.12 ? 1 : 0 };
        }}>
          <MushafScreen
            page={562}
            under={
              <>
                <View style={[at(6, LAST_LINE, 390, LINE_H), { backgroundColor: palette.highlightSoft, borderRadius: 8 }]} />
                <Anim t={t} box={[at(0, LAST_LINE + 2, 54, LINE_H - 4), { backgroundColor: palette.highlight, borderRadius: 7 }]} style={(now) => {
                  'worklet';
                  return { transform: [{ translateX: box(now) }] };
                }} />
                {/* A stumble: marked on the word reached for (RECITE-2). */}
                <Anim t={t} box={[at(STEPS_X[4], LAST_LINE + 2, 54, LINE_H - 4), { backgroundColor: palette.red, borderRadius: 7 }]} style={(now) => {
                  'worklet';
                  const u = seg(now, 1.85, 2.25);
                  return { opacity: Math.min(1, u * 3) * 0.28, transform: [{ translateY: (1 - easeOut(u)) * -14 }, { scale: lerp(1.35, 1, easeBack(u)) }] };
                }} />
              </>
            }
          />
          <TakeBar top="No mistakes" sub="1:12 · Al-Mulk, 1st page" score="100%" />
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
              <Anim t={t} box={[at(330, PAGE_BOX.top + 2, 60, LINE_H - 4), { backgroundColor: palette.highlight, borderRadius: 7 }]} style={(now) => {
                'worklet';
                const br = seg(now, 4.0, 7.0);
                return { opacity: seg(now, 4.0, 4.3), transform: [{ scale: 1 + 0.12 * Math.pow(Math.sin(br * Math.PI * 2.5), 2) }] };
              }} />
            }
          />
          <TakeBar top="1 mistake" sub="1:19 · Al-Mulk, 2nd page" score="98%" />
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

// ------------------------------------------------------------------ 5. A spot test, then Hasbuk (RECITE-8, ACT-34)
/** Ayah markers on the hidden page (rough places), the light hopping between them and stopping on the last. */
const MARKS: [number, number][] = [
  [276, 190],
  [311, 600],
  [69, 313],
  [244, 520],
  [261, 273],
  [205, 479],
  [144, 353],
  [175, 396],
];
const HOPS = [1.3, 1.44, 1.6, 1.79, 2.02, 2.3, 2.62];

function HiddenPage() {
  const { palette, isDark } = useTheme();
  const page = getReadPalette(isDark).pageBg;
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: page }]}>
      <View style={[at(0, 62, 402, 48), styles.centerCol]}>
        <T style={[styles.name, { color: palette.text }]}>Al-Mulk</T>
        <T style={[styles.tiny, { color: palette.secondary }]}>Page 562 · Juz 29</T>
      </View>
      {Array.from({ length: 15 }, (_, i) => (
        <View key={i} style={[at(16, PAGE_BOX.top + i * LINE_H + LINE_H * 0.74, 370, 1), { backgroundColor: palette.secondary, opacity: 0.35 }]} />
      ))}
      {MARKS.map(([x, y], i) => (
        <View key={i} style={[at(x - 11, y - 11, 22, 22), styles.marker, { borderColor: palette.secondary, backgroundColor: page }]}>
          <T style={[styles.tiny, { color: palette.secondary }]}>{i + 1}</T>
        </View>
      ))}
    </View>
  );
}

export function SpotSlide({ t }: { t: Clock }) {
  const { palette, isDark } = useTheme();
  const place = (now: number): ScreenAt => {
    'worklet';
    return resting(now);
  };
  const words = TAKE.lines.flat().map((x) => x.text);
  return (
    <>
      <Screen t={t} place={place}>
        <HiddenPage />
        {/* The light hops between ayah markers, slowing like a wheel, and stops. */}
        <Anim t={t} box={[at(-22, -22, 44, 44), { borderRadius: 22, backgroundColor: palette.highlight }]} style={(now) => {
          'worklet';
          let k = 0;
          while (k < HOPS.length - 1 && now > HOPS[k + 1]) k++;
          const next = k + 1 < HOPS.length ? HOPS[k + 1] : HOPS[k] + 0.3;
          const f = easeInOut(Math.min(1, Math.max(0, (now - HOPS[k]) / (next - HOPS[k]) / 0.7)));
          const a = MARKS[Math.min(k, MARKS.length - 1)];
          const b = MARKS[Math.min(k + 1, MARKS.length - 1)];
          const x = now < HOPS[0] ? MARKS[0][0] : k >= HOPS.length - 1 ? MARKS[MARKS.length - 1][0] : lerp(a[0], b[0], f);
          const y = now < HOPS[0] ? MARKS[0][1] : k >= HOPS.length - 1 ? MARKS[MARKS.length - 1][1] : lerp(a[1], b[1], f);
          const o = now < 1.25 ? 0 : now < 2.9 ? Math.min(1, (now - 1.25) * 6) : 1 - seg(now, 2.9, 3.1);
          return { opacity: o * 0.9, transform: [{ translateX: x }, { translateY: y }, { scale: now > 2.62 ? 1 + 0.25 * bump(seg(now, 2.62, 2.95)) : 1 }] };
        }} />
        {/* That ayah shows: its words appear as they're said, and the line under the header fills from the right. */}
        <View style={at(24, 405, 354)}>
          <WordsIn t={t} text={words.join(' ')} from={2.8} to={4.9} rtl style={[arabicV2(19), { color: palette.text }]} />
        </View>
        <View style={[at(0, 110, 402, 3), { backgroundColor: palette.separator }]}>
          <Anim t={t} box={[styles.fillRight, { backgroundColor: palette.primary }]} style={(now) => {
            'worklet';
            const u = easeInOut(seg(now, 2.75, 5.05));
            return { opacity: now > 2.7 ? 1 : 0, transform: [{ translateX: 201 * (1 - u) }, { scaleX: Math.max(0.001, u) }] };
          }} />
        </View>
        {/* Test me: one page, from everything memorized. */}
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
        {/* Kept in Activity: the test lands as its own entry (ACT-34). */}
        <Anim t={t} box={at(16, 694, 370)} style={(now) => {
          'worklet';
          const u = easeOut(seg(now, 5.3, 5.85));
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
      <Anim t={t} box={at(0, 262, 402)} style={(now) => {
        'worklet';
        const u = easeOut(seg(now, 2.65, 3.1));
        return { opacity: u, transform: [{ translateY: (1 - u) * 34 }] };
      }}>
        <ActivityDay />
      </Anim>
      <Anim t={t} box={at(16, 448, 370)} style={(now) => {
        'worklet';
        const u = easeOut(seg(now, 3.45, 3.9));
        return { opacity: u, transform: [{ translateY: (1 - u) * 18 }] };
      }}>
        <T style={[styles.eyebrow, { color: palette.secondary }]}>Your revision</T>
      </Anim>
      {INSIGHT_ROWS.map((row, i) => (
        <Anim key={row[0]} t={t} box={at(0, 476 + i * 62, 402)} style={(now) => {
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
    return { scale: lerp(0.66, SCREEN_AT.scale, g), top: lerp(80, SCREEN_AT.top, g), opacity: easeOut(seg(now, 7.25, 7.6)), zoom: along(now, [7.4, 1, 7.95, 1.9]), ox: 0, oy: 150 };
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
      const tg = pointOn(f, 56, 162);
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
            <View style={[at(i < 3 ? x + 34 : x - 34 - 160, y - 19, 160), i < 3 ? null : styles.endCol]}>
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
      {/* The latest badge flies down to Home and clicks into the corner of the picture. */}
      <Screen t={t} place={home}>
        <HomeSketch v3 photo />
        <Anim t={t} box={[at(44, 150, 24, 24), { borderRadius: 12 }]} style={(now) => {
          'worklet';
          const k = seg(now, 8.1, 8.5);
          return { opacity: k > 0 && k < 1 ? 1 : 0, transform: [{ scale: 1 + 0.7 * bump(k) }] };
        }}>
          <BadgeMark milestone={100} size={24} number={false} />
        </Anim>
        <Glint t={t} color={SPARK} size={16} where={(now) => {
          'worklet';
          return [62, 154, seg(now, 8.12, 8.6)];
        }} />
      </Screen>
    </>
  );
}

// ------------------------------------------------------------------ 9. Ready for Ramadan (THEME-2 to THEME-8)
const BULBS = 15;
const LANTERNS = [
  { x: 24, size: 0.95, rope: 44 },
  { x: 372, size: 1.1, rope: 86 },
  { x: 344, size: 0.7, rope: 26 },
];
const MOTES = 22;

function RamadanActivity({ month }: { month: boolean }) {
  const { palette, isDark } = useTheme();
  const tokens = ramadanV2(isDark, palette.accent);
  return (
    <View style={StyleSheet.absoluteFill}>
      <ActivityWeek />
      <View style={[at(0, 270, 402, 140), { backgroundColor: palette.bg }]}>
        <View style={styles.ramadanHead}>
          <Crescent size={18} tokens={tokens} />
          <T style={[styles.name, { color: palette.text }]}>Ramadan · Day 12</T>
          <View style={styles.flex} />
          <T style={[styles.meta, { color: palette.secondary }]}>12 of 12 days</T>
        </View>
        <View style={styles.moons}>
          {Array.from({ length: month ? 15 : 12 }, (_, i) => (
            <Moon key={i} size={20} day={i + 1} state={i < 12 ? 'lit' : 'ahead'} tokens={tokens} missed={palette.red} ahead={palette.track} />
          ))}
        </View>
      </View>
    </View>
  );
}

function RamadanRevo() {
  const { palette } = useTheme();
  return (
    <View style={StyleSheet.absoluteFill}>
      <ActivityWeek />
      <Sheet top={300}>
        <RevoHeader />
        <View style={styles.sayGap}>
          <T style={[styles.say, { color: palette.text }]}>
            Ramadan Kareem, Maryam. Day 12, and you’ve revised every day so far. Today’s 20 pages start at Al-Mujadila.
          </T>
        </View>
        <View style={styles.chipsBottom}>
          {['Plan a khatmah by Eid', 'What should I revise for taraweeh?'].map((c) => (
            <View key={c} style={[styles.chip, { borderColor: palette.outline }]}>
              <T style={[styles.button, { color: palette.text }]} numberOfLines={1}>
                {c}
              </T>
            </View>
          ))}
        </View>
      </Sheet>
    </View>
  );
}

function RamadanEndCard() {
  const { palette } = useTheme();
  return (
    <View style={[StyleSheet.absoluteFill, styles.centerCol, { backgroundColor: palette.bg, justifyContent: 'center' }]}>
      <View style={[styles.doneRing, { borderColor: palette.accentText }]}>
        <Ionicons name="checkmark" size={30} color={palette.accentText} />
      </View>
      <T style={[styles.title22, { color: palette.text, marginTop: 16 }]}>Revision complete</T>
      <T style={[styles.body, { color: palette.secondary }]}>Al-Mujadila to At-Tahrim</T>
      <T style={[styles.meta, { color: palette.secondary }]}>20 pages revised today</T>
      <T style={[styles.meta, { color: palette.secondary, marginTop: 6 }]}>Day 12 of Ramadan</T>
    </View>
  );
}

export function RamadanSlide({ t }: { t: Clock }) {
  const { palette, isDark } = useTheme();
  const tokens = ramadanV2(isDark, palette.accent);
  const place = (now: number): ScreenAt => {
    'worklet';
    const e = resting(now, along(now, [2.9, 1, 3.6, 1.3, 4.35, 1.3, 4.9, 1]), 201, 330);
    const dim = easeInOut(seg(now, 0.25, 1.0));
    const lift = easeInOut(seg(now, 1.2, 1.7));
    const o = now < 0.7 ? (e.opacity ?? 1) : now < 1.2 ? lerp(1, 0.18, dim) : lerp(0.18, 1, lift);
    return { ...e, opacity: o, top: (e.top ?? SCREEN_AT.top) + 40 * lift };
  };
  const motes = useMemo(
    () => Array.from({ length: MOTES }, (_, i) => ({ x: 8 + ((i * 71) % 386), y: (i * 137) % 600, v: 30 + ((i * 13) % 40), s: 2 + (i % 3), w: i * 0.7 })),
    [],
  );
  return (
    <>
      <OnStage>
      {/* Dusk: the screen dims, a warm light comes down from the top. */}
      <Anim t={t} box={StyleSheet.absoluteFill} style={(now) => {
        'worklet';
        return { opacity: easeInOut(seg(now, 0.3, 1.1)) };
      }}>
        <Svg width={402} height={690}>
          <Defs>
            <LinearGradient id="tourDusk" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={tokens.gold} stopOpacity={isDark ? 0.2 : 0.16} />
              <Stop offset="0.38" stopColor={tokens.gold} stopOpacity={0.05} />
              <Stop offset="0.7" stopColor={tokens.gold} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={402} height={690} fill="url(#tourDusk)" />
        </Svg>
      </Anim>
      </OnStage>
      <Screen t={t} place={place}>
        <HomeSketch v3 />
        <Anim t={t} box={StyleSheet.absoluteFill} style={(now) => {
          'worklet';
          return { opacity: easeInOut(seg(now, 1.2, 1.55)) };
        }}>
          <RamadanActivity month={false} />
        </Anim>
        {/* A moon for each day of the month. */}
        <Anim t={t} box={StyleSheet.absoluteFill} style={(now) => {
          'worklet';
          return { opacity: easeInOut(seg(now, 2.85, 3.15)) };
        }}>
          <RamadanActivity month />
        </Anim>
        {[0, 1, 2, 3].map((k) => (
          <Glint key={k} t={t} color={tokens.gold} size={14} where={(now) => {
            'worklet';
            return [40 + k * 90, 318, seg(now, 3.3 + k * 0.22, 3.9 + k * 0.22)];
          }} />
        ))}
        {/* Revo in Ramadan. */}
        <Anim t={t} box={StyleSheet.absoluteFill} style={(now) => {
          'worklet';
          const u = easeOut(seg(now, 4.4, 4.85));
          return { opacity: u, transform: [{ translateY: (1 - u) * 40 }] };
        }}>
          <RamadanRevo />
        </Anim>
        {[0, 1, 2].map((k) => (
          <Glint key={k} t={t} color={tokens.gold} size={[12, 9, 11][k]} where={(now) => {
            'worklet';
            const on = now > 4.85 && now < 6.1;
            return [[70, 90, 108][k], [352, 344, 354][k], on ? ((now - 4.85) * 1.2 + k * 0.3) % 1 : 0];
          }} />
        ))}
        {/* A session's end in Ramadan: gold light falls where the confetti was. */}
        <Anim t={t} box={StyleSheet.absoluteFill} style={(now) => {
          'worklet';
          return { opacity: easeInOut(seg(now, 6.0, 6.35)) };
        }}>
          <RamadanEndCard />
        </Anim>
      </Screen>
      <OnStage>
      {/* The crescent rises, then takes its corner. */}
      <Anim t={t} box={at(0, 0, 70, 70)} style={(now) => {
        'worklet';
        const cr = easeOut(seg(now, 0.35, 1.2));
        const mv = easeInOut(seg(now, 1.25, 1.9));
        return { opacity: cr * 0.95, transform: [{ translateX: lerp(201, 360, mv) - 35 }, { translateY: lerp(lerp(420, 360, cr), 70, mv) - 35 }, { scale: lerp(1, 30 / 70, mv) }] };
      }}>
        <Crescent size={70} tokens={tokens} />
      </Anim>
      {/* String lights light across the top, one by one. */}
      <Svg width={402} height={60} style={styles.lights}>
        <Path d="M0,4 Q100.5,40 201,4 T402,4" fill="none" stroke={tokens.wire} strokeWidth={1} />
      </Svg>
      {Array.from({ length: BULBS }, (_, i) => {
        const tt = (i + 0.5) / BULBS;
        const u = (tt * 2) % 1;
        const x = tt * 402;
        const y = 4 + 36 * 2 * u * (1 - u) + 4;
        return (
          <Anim key={i} t={t} box={[at(x - 8, y - 8 + 6, 16, 16), styles.centerCol, { justifyContent: 'center' }]} style={(now) => {
            'worklet';
            const lit = seg(now, 1.4 + tt * 1.05, 1.45 + tt * 1.05);
            return { opacity: seg(now, 1.3, 1.5) * (0.18 + 0.82 * lit) };
          }}>
            <View style={[styles.bulbHalo, { backgroundColor: tokens.bulbs[i % 3] }]} />
            <View style={[styles.bulb, { backgroundColor: tokens.bulbs[i % 3] }]} />
          </Anim>
        );
      })}
      {/* Three lanterns drop and swing to rest. */}
      {LANTERNS.map((l, i) => (
        <Anim key={i} t={t} box={[at(l.x - 20 * l.size, 0, 40 * l.size, (l.rope + 62) * l.size), styles.lantern]} style={(now) => {
          'worklet';
          const d0 = 1.5 + i * 0.12;
          const dk = easeOut(seg(now, d0, d0 + 0.6));
          const tau = Math.max(0, now - d0 - 0.5);
          const amp = 10 * (i % 2 ? 1 : -1) * (1 - 0.2 * i);
          const ang = (now < d0 + 0.5 ? amp * 0.4 : amp * Math.exp(-1.5 * tau) * Math.sin(5.2 * tau + 1.2)) + 1.6 * Math.sin(1.3 * now + i);
          return { opacity: dk > 0 ? 1 : 0, transform: [{ translateY: (1 - dk) * -190 }, { rotate: `${ang}deg` }] };
        }}>
          <View style={[styles.rope, { height: l.rope * l.size, backgroundColor: tokens.wire }]} />
          <Lantern height={48 * l.size * 1.3} tokens={tokens} />
        </Anim>
      ))}
      {/* Falling light. */}
      {motes.map((m, i) => (
        <Anim key={i} t={t} box={[at(0, 0, m.s, m.s), { borderRadius: m.s, backgroundColor: tokens.mote }]} style={(now) => {
          'worklet';
          const y = 90 + ((m.y + m.v * now) % 560);
          return { opacity: now < 6.0 ? 0 : seg(now, 6.0, 6.5) * tokens.moteOpacity, transform: [{ translateX: m.x + Math.sin(now + m.w) * 6 }, { translateY: y }] };
        }} />
      ))}
      </OnStage>
    </>
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
  start: { height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginTop: 16, marginBottom: 12 },
  miniRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, height: 39 },
  shadow: { shadowOpacity: 0.16, shadowRadius: 12, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  shine: { borderRadius: 17, overflow: 'hidden' },
  window: { overflow: 'hidden' },
  spotCard: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 16 },
  spotIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', left: 0, top: 0 },
  bigBadge: { position: 'absolute', left: 34, top: 34 },
  ramadanHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 14 },
  moons: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 16, paddingTop: 12 },
  chipsBottom: { flexDirection: 'row', gap: 8, marginTop: 'auto', marginBottom: 60 },
  chip: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8 },
  doneRing: { width: 64, height: 64, borderRadius: 32, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
  lights: { position: 'absolute', left: 0, top: 6 },
  bulb: { position: 'absolute', width: 6.4, height: 6.4, borderRadius: 3.2 },
  bulbHalo: { position: 'absolute', width: 16, height: 16, borderRadius: 8, opacity: 0.16 },
  lantern: { alignItems: 'center', transformOrigin: 'top' },
  rope: { width: 1.2 },
});
