// What's new, Revo's card as a moment (lib/whatsNew/revoMoment: the clock, words and layout). It plays
// by itself in about 19 s and Skip, in the top corner, takes it to its end; a touch anywhere else does
// nothing (Majd, Nov 9 2026: a tap anywhere was too easy to set off). The R writes itself, four questions in big
// type each answered by a picture that turns into the next, a ring of questions drawn into Revo, and
// Revo flying to its place on Home. Then Turn on Revo (Revo's own opt-in, REVO-21) or Later (NEW-2).
// Drawn with Reanimated on the UI thread and react-native-svg, in the account's theme and accent; the
// pictures are marked Example and hold no account's numbers. Reduce Motion: still frames that
// cross-fade. VoiceOver: the end at once, read as one line.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Modal, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedProps,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, G, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import { useHaptics } from '../../design/haptics';
import { useReduceMotion } from '../../design/motion';
import { arabicV2, revoV2 } from '../../theme/v2';
import { useTabBarHeight } from '../../navigation/TabBar';
import { revoBackend } from '../../lib/revo/backend';
import { refreshRevoRelease } from '../../lib/revo/release';
import { useRevoSettings } from '../../lib/revo/useRevoSettings';
import { REVO_BUTTON_GAP, REVO_BUTTON_SIZE } from '../../lib/revo/presence';
import {
  FIRST_JUZ,
  JUZ_SHADE,
  MOMENT_CHOICE_P,
  MOMENT_HAPTICS,
  MOMENT_ORBIT,
  MOMENT_QUESTIONS,
  MOMENT_WEEK,
  MOMENT_WEEK_MAX,
  MOMENT_WORDS,
  QUESTION_TIMES_P,
  WEEK_LETTERS,
  back,
  eio,
  eo,
  hapticsCrossed,
  lerp,
  momentFrame,
  momentLayout,
  momentLength,
  seg,
  stillFade,
  typedState,
  type MomentLayout,
} from '../../lib/whatsNew/revoMoment';
import { R_PATH } from '../revo/rMarkPath';
import { RevoMark } from '../revo/RevoMark';
import { RevoOptIn } from '../revo/RevoPages';
import { PillButton } from '../v2/PillButton';
import { Tap } from '../v2/Tap';
import { Stepper } from '../Stepper';
import { R_TRACE } from './rTrace';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** The mark is drawn at its largest (the R writing itself) and scaled down from there. */
const BOX = 300;
/** The R at its largest fills 90% of the box; on the disc it is RevoMark's 29/56 of it. */
const R_BIG = 1.75;
const R_SCALE = (BOX / 100) * (29 / 56 / 644.99) * 100 * R_BIG;
const TL = R_TRACE.length;
const TX = R_TRACE.xs;
const TY = R_TRACE.ys;
const GLOW_BOX = 600;
/** Text stops growing here: the moment is laid out to the point (past 1.6× the card is words only). */
const BIG_TEXT_MAX = 1.2;
const TEXT_MAX = 1.3;

type P = SharedValue<number>;

/** Where Revo's mark is, how big, and how far it has drawn itself (prototype time `p`). */
function markAt(p: number, L: MomentLayout) {
  'worklet';
  const sp = eio(seg(p, 0.3, 2.5));
  const fo = seg(p, 2.2, 2.8);
  const kf = eio(seg(p, 2.7, 3.5));
  let size = lerp(BOX, 150, kf);
  const rk = lerp(R_BIG, 1, kf);
  const dk = back(seg(p, 2.75, 3.4));
  let cx = L.cx;
  let cy = 360 + L.oy;
  const k2 = eio(seg(p, 4.3, 4.8));
  cy = lerp(cy, 118 + L.oy, k2);
  size = lerp(size, 60, k2);
  const k4 = eio(seg(p, 10.9, 11.4));
  cy = lerp(cy, 400 + L.oy, k4);
  size = lerp(size, 100, k4);
  size *= 1 + 0.1 * Math.sin(Math.PI * seg(p, 12.25, 12.6));
  const kd = eio(seg(p, 12.5, 13.4));
  if (kd > 0) {
    // A curve down to Home's button.
    const x0 = L.cx;
    const y0 = 400 + L.oy;
    const x1 = L.button.x - 4;
    const y1 = 430 + L.oy;
    const u = 1 - kd;
    cx = u * u * x0 + 2 * u * kd * x1 + kd * kd * L.button.x;
    cy = u * u * y0 + 2 * u * kd * y1 + kd * kd * L.button.y;
    size = lerp(size, REVO_BUTTON_SIZE, kd);
  }
  const flood = Math.sin(Math.PI * seg(p, 2.3, 3.4));
  const glow = Math.min(1, 0.4 * seg(p, 0.3, 1.2) + 0.6 * flood + 0.5 * seg(p, 3.0, 3.6)) * lerp(1, 0.55, kd);
  return { cx, cy, size, rk, dk, sp, fo, glow, docked: seg(p, 13.4, 13.6) };
}

/** The pen's tip: where along the R the stroke has reached, lit while it writes. */
function penAt(m: { sp: number; fo: number }) {
  'worklet';
  const o = m.sp > 0 && m.sp < 1 ? 1 : m.sp >= 1 ? Math.max(0, 1 - m.fo * 2.5) : 0;
  const f = Math.min(0.9999, m.sp) * (TX.length - 1);
  const i = Math.floor(f);
  const k = f - i;
  return { cx: TX[i] + (TX[i + 1] - TX[i]) * k, cy: TY[i] + (TY[i + 1] - TY[i]) * k, opacity: o };
}

function useScreenReader(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isScreenReaderEnabled?.()
      .then((v) => {
        if (live) setOn(v);
      })
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener?.('screenReaderChanged', setOn);
    return () => {
      live = false;
      sub?.remove?.();
    };
  }, []);
  return on;
}

// ------------------------------------------------------------------ the mark

function Glow({ p, L, max }: { p: P; L: MomentLayout; max: number }) {
  const { palette } = useTheme();
  const style = useAnimatedStyle(() => {
    const m = markAt(p.value, L);
    const gs = Math.max(220, m.size * 3.2);
    return {
      opacity: m.glow * max,
      transform: [{ translateX: m.cx - GLOW_BOX / 2 }, { translateY: m.cy - GLOW_BOX / 2 }, { scale: gs / GLOW_BOX }],
    };
  });
  return (
    <Animated.View style={[styles.glow, style]} pointerEvents="none">
      <Svg width={GLOW_BOX} height={GLOW_BOX}>
        <Defs>
          <RadialGradient id="momentGlow" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={palette.revo.glow} stopOpacity={1} />
            <Stop offset="1" stopColor={palette.revo.glow} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={GLOW_BOX / 2} cy={GLOW_BOX / 2} r={GLOW_BOX / 2} fill="url(#momentGlow)" />
      </Svg>
    </Animated.View>
  );
}

function Mark({ p, L, ring }: { p: P; L: MomentLayout; ring: boolean }) {
  const { palette } = useTheme();
  const [r0, r1] = palette.revo.r;
  const disc = useAnimatedStyle(() => {
    const m = markAt(p.value, L);
    return {
      opacity: 1 - m.docked,
      transform: [{ translateX: m.cx - BOX / 2 }, { translateY: m.cy - BOX / 2 }, { scale: Math.max(0.0001, m.dk) * (m.size / BOX) }],
    };
  });
  const letter = useAnimatedStyle(() => {
    const m = markAt(p.value, L);
    return {
      opacity: 1 - m.docked,
      transform: [{ translateX: m.cx - BOX / 2 }, { translateY: m.cy - BOX / 2 }, { scale: (m.rk / R_BIG) * (m.size / BOX) }],
    };
  });
  const fill = useAnimatedProps(() => ({ fillOpacity: markAt(p.value, L).fo }));
  const stroke = useAnimatedProps(() => {
    const m = markAt(p.value, L);
    return { strokeDashoffset: TL * (1 - m.sp), strokeOpacity: m.sp > 0 ? 1 - m.fo : 0 };
  });
  const penGlow = useAnimatedProps(() => penAt(markAt(p.value, L)));
  const penTip = useAnimatedProps(() => penAt(markAt(p.value, L)));
  return (
    <>
      <Animated.View style={[styles.box, disc]} pointerEvents="none">
        <Svg width={BOX} height={BOX}>
          <Defs>
            <RadialGradient id="momentDisc" cx="30%" cy="25%" r="80%">
              <Stop offset="0" stopColor={palette.revo.disc} />
              <Stop offset="0.55" stopColor={revoV2.discMid} />
              <Stop offset="1" stopColor={revoV2.discEdge} />
            </RadialGradient>
          </Defs>
          <Circle cx={BOX / 2} cy={BOX / 2} r={BOX / 2} fill="url(#momentDisc)" />
          {ring ? <Circle cx={BOX / 2} cy={BOX / 2} r={BOX / 2 - 1.5} fill="none" stroke={palette.revo.ring} strokeOpacity={0.6} strokeWidth={2.4} /> : null}
        </Svg>
      </Animated.View>
      <Animated.View style={[styles.box, letter]} pointerEvents="none">
        <Svg width={BOX} height={BOX}>
          <Defs>
            <LinearGradient id="momentR" gradientUnits="userSpaceOnUse" x1="0" y1="610.49" x2="644.99" y2="0">
              <Stop offset="0" stopColor={r0} />
              <Stop offset="1" stopColor={r1} />
            </LinearGradient>
            <RadialGradient id="momentPen" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={r1} stopOpacity={0.95} />
              <Stop offset="1" stopColor={r1} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <G transform={`translate(${BOX / 2} ${BOX / 2}) scale(${R_SCALE}) translate(-322.5 -305.25)`}>
            <AnimatedPath d={R_PATH} fill="url(#momentR)" animatedProps={fill} />
            <AnimatedPath
              d={R_PATH}
              fill="none"
              stroke="url(#momentR)"
              strokeWidth={2.4 / R_SCALE}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={[TL, TL]}
              animatedProps={stroke}
            />
            <AnimatedCircle r={11 / R_SCALE} fill="url(#momentPen)" animatedProps={penGlow} />
            <AnimatedCircle r={2.4 / R_SCALE} fill={revoV2.penTip} animatedProps={penTip} />
          </G>
        </Svg>
      </Animated.View>
    </>
  );
}

/** Once Revo has landed, the button itself: drawn at its own size, crisp. */
function Docked({ p, L, ring }: { p: P; L: MomentLayout; ring: boolean }) {
  const style = useAnimatedStyle(() => ({ opacity: seg(p.value, 13.4, 13.6) }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.abs, { left: L.button.x - REVO_BUTTON_SIZE / 2, top: L.button.y - REVO_BUTTON_SIZE / 2 }, style]}
    >
      <RevoMark size={REVO_BUTTON_SIZE} ring={ring} />
    </Animated.View>
  );
}

// ------------------------------------------------------------------ the signature and the questions

function Letter({ p, i, c }: { p: P; i: number; c: string }) {
  const { palette } = useTheme();
  const style = useAnimatedStyle(() => {
    const k = eo(seg(p.value, 3.3 + i * 0.07, 3.65 + i * 0.07));
    const out = seg(p.value, 4.3, 4.6);
    return { opacity: k * (1 - out), transform: [{ translateY: (1 - k) * 18 - out * 16 }] };
  });
  return (
    <Animated.Text style={[styles.wordmark, { color: palette.text }, style]} maxFontSizeMultiplier={BIG_TEXT_MAX}>
      {c}
    </Animated.Text>
  );
}

function Signature({ p, L }: { p: P; L: MomentLayout }) {
  const { palette } = useTheme();
  const tag = useAnimatedStyle(() => ({ opacity: seg(p.value, 3.6, 4.0) * (1 - seg(p.value, 4.3, 4.6)) }));
  return (
    <>
      <View style={[styles.row, styles.centerRow, { top: 470 + L.oy, width: L.width }]}>
        {MOMENT_WORDS.wordmark.split('').map((c, i) => (
          <Letter key={i} p={p} i={i} c={c} />
        ))}
      </View>
      <Animated.Text style={[styles.tagline, { top: 538 + L.oy, width: L.width, color: palette.secondary }, tag]} maxFontSizeMultiplier={TEXT_MAX}>
        {MOMENT_WORDS.tagline}
      </Animated.Text>
    </>
  );
}

function Question({ p, i, L, typed }: { p: P; i: number; L: MomentLayout; typed: number }) {
  const { palette } = useTheme();
  const [s, e] = QUESTION_TIMES_P[i];
  const style = useAnimatedStyle(() => {
    const out = seg(p.value, e, e + 0.25);
    const on = p.value >= s && p.value < e + 0.25;
    return { opacity: on ? 1 - out : 0, transform: [{ translateY: -28 * eio(out) }] };
  });
  const text = MOMENT_QUESTIONS[i];
  return (
    <Animated.Text
      style={[styles.question, { top: 186 + L.oy, left: (L.width - L.questionWidth) / 2, width: L.questionWidth, color: palette.text }, style]}
      maxFontSizeMultiplier={BIG_TEXT_MAX}
    >
      {text.slice(0, Math.floor(typed))}
      {typed % 1 ? <Text style={{ color: palette.accentText, fontWeight: '300' }}>|</Text> : null}
    </Animated.Text>
  );
}

/** A bar of the week, then a juz of the 30: one shape turning into the other, then gone. */
function Cell({ p, i, L, color }: { p: P; i: number; L: MomentLayout; color: string }) {
  const style = useAnimatedStyle(() => {
    const t = p.value;
    const kb = seg(t, 5.2, 5.9);
    const km = seg(t, 6.55, 7.25);
    const kx = eio(seg(t, 7.9, 8.15));
    const bi = i < 7 ? i : i % 7;
    const bh = Math.max(4, (MOMENT_WEEK[bi] / MOMENT_WEEK_MAX) * 150);
    const bx = L.cx - 140 + bi * 40 + 7.6;
    const by = 560 + L.oy - bh;
    const g = i < 7 ? eo(Math.min(1, Math.max(0, (kb - i * 0.06) / 0.58))) : 0;
    const fx = i < 7 ? bx : bx + 12.4;
    const fy = i < 7 ? by + bh * (1 - g) : by;
    const fw = i < 7 ? 24.8 : 0;
    const fh = i < 7 ? bh * g : 0;
    const fr = i < 7 ? 5 : 0;
    const tx = L.cx - 113 + (i % 6) * 40;
    const ty = 372 + L.oy + Math.floor(i / 6) * 40;
    const k = eio(Math.min(1, Math.max(0, (km - i * 0.012) / 0.65)));
    const x = lerp(fx, tx, k);
    const y = lerp(fy, ty, k);
    const w = lerp(fw, 26, k);
    const h = lerp(fh, 26, k);
    const oFrom = i < 7 && g > 0 ? 1 : 0;
    const oTo = i === FIRST_JUZ - 1 ? 1 : JUZ_SHADE[i] * 0.85;
    return {
      left: x + w * kx * 0.5,
      top: y + h * kx * 0.5,
      width: w * (1 - kx),
      height: h * (1 - kx),
      borderRadius: lerp(fr, 13, k),
      opacity: t < 5.2 ? 0 : lerp(oFrom, oTo, k) * (1 - kx),
    };
  });
  return <Animated.View style={[styles.abs, { backgroundColor: color }, style]} />;
}

function Pictures({ p, L }: { p: P; L: MomentLayout }) {
  const { palette } = useTheme();
  const letters = useAnimatedStyle(() => ({ opacity: seg(p.value, 5.4, 5.7) * (1 - seg(p.value, 6.45, 6.65)) }));
  const example = useAnimatedStyle(() => ({ opacity: seg(p.value, 5.3, 5.6) * (1 - seg(p.value, 7.9, 8.1)) }));
  const ring = useAnimatedStyle(() => {
    const k = seg(p.value, 7.25, 7.9);
    const r = 13 + 10 * eo(k);
    const x = L.cx - 113 + ((FIRST_JUZ - 1) % 6) * 40 + 13;
    const y = 372 + L.oy + Math.floor((FIRST_JUZ - 1) / 6) * 40 + 13;
    return {
      left: x - r,
      top: y - r,
      width: r * 2,
      height: r * 2,
      borderRadius: r,
      opacity: p.value >= 7.25 && p.value < 7.95 ? 1 - k * 0.7 : 0,
    };
  });
  const juzLine = useAnimatedStyle(() => ({ opacity: seg(p.value, 7.35, 7.6) * (1 - seg(p.value, 7.9, 8.1)) }));
  const logLine = useAnimatedStyle(() => ({ opacity: seg(p.value, 8.9, 9.1) * (1 - seg(p.value, 9.45, 9.65)) }));
  const moon = useAnimatedStyle(() => {
    const k = eo(seg(p.value, 9.6, 10.2));
    return { opacity: k * (1 - seg(p.value, 10.9, 11.1)), transform: [{ translateY: (1 - k) * 60 }] };
  });
  const day = useAnimatedStyle(() => {
    const k = eo(seg(p.value, 9.95, 10.3));
    return { opacity: k * (1 - seg(p.value, 10.9, 11.1)), transform: [{ translateY: (1 - k) * 14 }] };
  });
  const cardWidth = Math.min(322, L.width - 80);
  return (
    <>
      <Animated.View style={[styles.centerRow, styles.abs, { top: 330 + L.oy, width: L.width }, example]}>
        <Text style={[styles.example, { color: palette.subtleText, backgroundColor: palette.accentSubtle }]} maxFontSizeMultiplier={TEXT_MAX}>
          {MOMENT_WORDS.example}
        </Text>
      </Animated.View>
      {JUZ_SHADE.map((_, i) => (
        <Cell key={i} p={p} i={i} L={L} color={palette.primary} />
      ))}
      {WEEK_LETTERS.map((l, i) => (
        <Animated.Text
          key={i}
          style={[styles.weekLetter, { top: 572 + L.oy, left: L.cx - 140 + i * 40, color: palette.secondary }, letters]}
          maxFontSizeMultiplier={TEXT_MAX}
        >
          {l}
        </Animated.Text>
      ))}
      <Animated.View style={[styles.abs, { borderWidth: 2, borderColor: palette.primary }, ring]} />
      <Animated.Text style={[styles.caption, { top: 590 + L.oy, width: L.width - 60, color: palette.secondary }, juzLine]} maxFontSizeMultiplier={TEXT_MAX}>
        {MOMENT_WORDS.juzLead}
        <Text style={{ color: palette.text, fontWeight: '600' }}>{MOMENT_WORDS.juzName}</Text>
        {MOMENT_WORDS.juzTail}
      </Animated.Text>
      <Crumbs p={p} L={L} />
      <Animated.Text style={[styles.caption, { top: 486 + L.oy, width: L.width - 60, color: palette.secondary }, logLine]} maxFontSizeMultiplier={TEXT_MAX}>
        {MOMENT_WORDS.logLine}
      </Animated.Text>
      <Animated.View style={[styles.abs, { top: 372 + L.oy, left: L.cx - 30 }, moon]}>
        <Ionicons name="moon" size={60} color={palette.accentText} />
      </Animated.View>
      <Animated.View
        style={[styles.dayCard, { top: 470 + L.oy, left: (L.width - cardWidth) / 2, width: cardWidth, borderColor: palette.outline, backgroundColor: palette.bg }, day]}
      >
        <RevoMark size={36} />
        <View style={styles.flex}>
          <Text style={[styles.cardTitle, { color: palette.text }]} maxFontSizeMultiplier={TEXT_MAX}>
            {MOMENT_WORDS.dayTitle}
          </Text>
          <Text style={[styles.cardLine, { color: palette.secondary }]} maxFontSizeMultiplier={TEXT_MAX}>
            {MOMENT_WORDS.dayLine}
          </Text>
        </View>
      </Animated.View>
    </>
  );
}

function Pop({ p, at, children }: { p: P; at: number; children: React.ReactNode }) {
  const style = useAnimatedStyle(() => {
    const k = back(seg(p.value, at, at + 0.22));
    return { opacity: (p.value >= at ? 1 : 0) * (1 - seg(p.value, 9.45, 9.65)), transform: [{ scale: Math.max(0.01, k) }] };
  });
  return <Animated.View style={style}>{children}</Animated.View>;
}

/** Activity › Today › +: the way to log revision done elsewhere. */
function Crumbs({ p, L }: { p: P; L: MomentLayout }) {
  const { palette } = useTheme();
  const crumb = (label: string) => (
    <View style={[styles.crumb, { borderColor: palette.outline, backgroundColor: palette.bg }]}>
      <Text style={[styles.crumbText, { color: palette.text }]} maxFontSizeMultiplier={BIG_TEXT_MAX}>
        {label}
      </Text>
    </View>
  );
  const sep = <Text style={[styles.sep, { color: palette.secondary }]}>›</Text>;
  return (
    <View style={[styles.row, styles.centerRow, styles.abs, { top: 410 + L.oy, width: L.width, gap: 8 }]}>
      <Pop p={p} at={8.3}>
        {crumb(MOMENT_WORDS.crumbs[0])}
      </Pop>
      <Pop p={p} at={8.42}>
        {sep}
      </Pop>
      <Pop p={p} at={8.5}>
        {crumb(MOMENT_WORDS.crumbs[1])}
      </Pop>
      <Pop p={p} at={8.62}>
        {sep}
      </Pop>
      <Pop p={p} at={8.7}>
        <View style={[styles.crumb, { borderColor: palette.primary, backgroundColor: palette.primary }]}>
          <Ionicons name="add" size={20} color={palette.onPrimary} />
        </View>
      </Pop>
    </View>
  );
}

/** One of the ring of questions circling Revo. */
function OrbitChip({ p, i, L, label }: { p: P; i: number; L: MomentLayout; label: string }) {
  const { palette } = useTheme();
  const style = useAnimatedStyle(() => {
    const t = p.value;
    const conv = eio(seg(t, 12.0, 12.4));
    const a = (i / MOMENT_ORBIT.length) * Math.PI * 2 + (t - 10.9) * 0.45;
    const rf = 1 - conv;
    const x = L.cx + Math.cos(a) * 100 * rf;
    const y = 400 + L.oy + Math.sin(a) * L.orbitRy * rf;
    const depth = (Math.sin(a) + 1) / 2;
    const appear = seg(t, 11.0 + i * 0.05, 11.3 + i * 0.05);
    const on = t >= 10.9 && t < 12.45;
    return {
      opacity: on ? appear * (0.5 + 0.5 * depth) * (1 - seg(t, 12.15, 12.4)) : 0,
      transform: [{ translateX: x - 140 }, { translateY: y - 18 }, { scale: (0.82 + 0.22 * depth) * lerp(1, 0.3, conv) }],
    };
  });
  return (
    <Animated.View style={[styles.orbitSlot, style]} pointerEvents="none">
      <View style={[styles.chip, { borderColor: palette.outline, backgroundColor: palette.bg }]}>
        <Text style={[styles.chipText, { color: palette.text }]} numberOfLines={1} maxFontSizeMultiplier={1.15}>
          {label}
        </Text>
      </View>
    </Animated.View>
  );
}

// ------------------------------------------------------------------ Home, where Revo lives

/** Home, sketched: its top bar, a Today post's shape and the tab bar. No figures: they'd read as the account's. */
function HomeSketch({ p, firstName, topInset, tabBar }: { p: P; firstName: string; topInset: number; tabBar: number }) {
  const { palette } = useTheme();
  const style = useAnimatedStyle(() => ({ opacity: seg(p.value, 12.5, 13.0) }));
  const bar = (width: number | `${number}%`, height = 12) => <View style={[styles.sketchBar, { width, height, backgroundColor: palette.fill }]} />;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: palette.bg }, style]} pointerEvents="none">
      <View style={[styles.sketchTop, { top: topInset }]}>
        <Text style={[arabicV2(20), { color: palette.text }]} maxFontSizeMultiplier={1}>
          السلام عليكم
        </Text>
        <View style={styles.sketchIcons}>
          {(['compass-outline', 'pulse-outline', 'settings-outline'] as const).map((n) => (
            <Ionicons key={n} name={n} size={24} color={palette.text} />
          ))}
        </View>
      </View>
      <View style={[styles.sketchPost, { top: topInset + 64 }]}>
        <View style={[styles.avatar, { backgroundColor: palette.bubble }]}>
          <Text style={[styles.avatarText, { color: palette.text }]} maxFontSizeMultiplier={1}>
            {(firstName[0] ?? 'R').toUpperCase()}
          </Text>
        </View>
        <View style={[styles.flex, { gap: 10 }]}>
          <Text style={[styles.cardTitle, { color: palette.text }]} numberOfLines={1} maxFontSizeMultiplier={1}>
            {firstName || 'Today'}
          </Text>
          {bar('70%', 16)}
          {bar('55%')}
          <View style={[styles.sketchPill, { backgroundColor: palette.primary }]} />
          {bar('62%')}
        </View>
      </View>
      {[0, 1, 2].map((i) => (
        <View key={i} style={[styles.sketchRow, { top: topInset + 300 + i * 60, borderColor: palette.separator }]}>
          <View style={[styles.avatarSmall, { backgroundColor: palette.bubble }]} />
          <View style={[styles.flex, { gap: 8 }]}>
            {bar(`${70 - i * 8}%`)}
            {bar('34%', 10)}
          </View>
        </View>
      ))}
      <View style={[styles.sketchTabs, { height: tabBar, borderColor: palette.separator, backgroundColor: palette.bg }]}>
        <View style={styles.sketchTab}>
          <Ionicons name="home" size={26} color={palette.text} />
          <View style={[styles.tabDot, { backgroundColor: palette.accentText }]} />
        </View>
        <View style={styles.sketchTab}>
          <Ionicons name="book-outline" size={26} color={palette.secondary} />
        </View>
      </View>
    </Animated.View>
  );
}

/** The screen fades around Revo's button, leaving it lit. */
function Veil({ p, L }: { p: P; L: MomentLayout }) {
  const { palette, isDark } = useTheme();
  const style = useAnimatedStyle(() => ({ opacity: seg(p.value, 13.6, 14.0) }));
  const pulse = useAnimatedStyle(() => {
    const k = seg(p.value, 13.4, 14.1);
    const r = 22 + 38 * eo(k);
    return {
      left: L.button.x - r,
      top: L.button.y - r,
      width: r * 2,
      height: r * 2,
      borderRadius: r,
      opacity: p.value >= 13.4 && p.value < 14.1 ? 0.9 * (1 - k) : 0,
    };
  });
  const hole = 34;
  const d =
    `M0 0H${L.width}V${L.height}H0Z` +
    `M${L.button.x - hole} ${L.button.y}a${hole} ${hole} 0 1 0 ${hole * 2} 0a${hole} ${hole} 0 1 0 ${-hole * 2} 0Z`;
  return (
    <>
      <Animated.View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
        <Svg width={L.width} height={L.height}>
          <Path d={d} fill={palette.bg} fillOpacity={isDark ? 0.94 : 0.95} fillRule="evenodd" />
        </Svg>
      </Animated.View>
      <Animated.View style={[styles.abs, { borderWidth: 2, borderColor: palette.revo.ring }, pulse]} pointerEvents="none" />
    </>
  );
}

// ------------------------------------------------------------------ the choice

function Rise({ p, i, style, children }: { p: P; i: number; style?: object; children: React.ReactNode }) {
  const rise = useAnimatedStyle(() => {
    const k = eo(seg(p.value, MOMENT_CHOICE_P + i * 0.06, MOMENT_CHOICE_P + 0.32 + i * 0.06));
    return { opacity: k, transform: [{ translateY: (1 - k) * 12 }] };
  });
  return <Animated.View style={[styles.abs, style, rise]}>{children}</Animated.View>;
}

export function RevoMoment({
  step,
  total,
  title,
  text,
  firstName,
  smartTracking,
  closable,
  onNext,
  onClose,
}: {
  step: number;
  total: number;
  title: string;
  text: string;
  /** The account's first name, for Home's sketch: it stays on the phone. */
  firstName: string;
  smartTracking: boolean;
  /** The replay's ✕ (NEW-3). */
  closable: boolean;
  /** Later, Next, or Revo turned on: on to the next card. */
  onNext: () => void;
  onClose?: () => void;
}) {
  const { palette, isDark } = useTheme();
  const haptics = useHaptics();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const tabBar = useTabBarHeight();
  const L = useMemo(
    () => momentLayout(width, height, insets.top, insets.bottom, tabBar, REVO_BUTTON_SIZE, REVO_BUTTON_GAP),
    [width, height, insets.top, insets.bottom, tabBar],
  );
  const reduce = useReduceMotion();
  const reader = useScreenReader();
  const settings = useRevoSettings(true);
  const alreadyOn = settings?.optIn === true;

  const [run, setRun] = useState(0);
  const [ended, setEnded] = useState(false);
  const [typedKey, setTypedKey] = useState('0,0,0,0');
  const [optIn, setOptIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clock = useSharedValue(0);
  const still = useSharedValue(reduce ? 1 : 0);
  const p = useDerivedValue(() => momentFrame(clock.value, still.value === 1));
  const fade = useDerivedValue(() => stillFade(clock.value, still.value === 1));

  useEffect(() => {
    still.value = reduce ? 1 : 0;
    const length = momentLength(reduce);
    cancelAnimation(clock);
    if (reader) {
      clock.value = length;
      setEnded(true);
      return;
    }
    setEnded(false);
    clock.value = 0;
    clock.value = withTiming(length, { duration: length * 1000, easing: Easing.linear }, (finished) => {
      if (finished) runOnJS(setEnded)(true);
    });
    return () => cancelAnimation(clock);
  }, [reduce, reader, run]); // eslint-disable-line react-hooks/exhaustive-deps

  const buzz = useCallback(() => haptics.light(), [haptics]);
  useAnimatedReaction(
    () => clock.value,
    (now, prev) => {
      if (prev == null || still.value === 1) return;
      if (hapticsCrossed(prev, now) > 0) runOnJS(buzz)();
    },
  );
  useAnimatedReaction(
    () => typedState(p.value).join(','),
    (key, prev) => {
      if (key !== prev) runOnJS(setTypedKey)(key);
    },
  );
  const typed = typedKey.split(',').map(Number);

  const skip = useCallback(() => {
    if (ended) return;
    cancelAnimation(clock);
    clock.value = momentLength(reduce);
    setEnded(true);
  }, [ended, reduce]); // eslint-disable-line react-hooks/exhaustive-deps

  const turnOn = async () => {
    setBusy(true);
    setError(null);
    try {
      await revoBackend().setOptions({ optIn: true });
      setOptIn(false);
      onNext();
    } catch (err) {
      setError((err as Error)?.message ?? 'Revo isn’t available on this account.');
      // Paused, or not open to this account (REVO-37): the switch is read again.
      if ((err as { refusal?: string })?.refusal === 'paused') void refreshRevoRelease(true);
    } finally {
      setBusy(false);
    }
  };

  const faded = useAnimatedStyle(() => ({ opacity: fade.value }));
  const top = insets.top;
  const wide = { left: 16, width: L.width - 32 };

  return (
    <View style={styles.fill} testID="whats-new-revo-moment">
      <Animated.View style={[StyleSheet.absoluteFill, faded]} pointerEvents="box-none">
        <View style={StyleSheet.absoluteFill} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <HomeSketch p={p} firstName={firstName} topInset={top} tabBar={tabBar} />
          <Glow p={p} L={L} max={isDark ? 0.55 : 0.28} />
          {MOMENT_ORBIT.map((label, i) => (
            <OrbitChip key={label} p={p} i={i} L={L} label={label} />
          ))}
          <Signature p={p} L={L} />
          {MOMENT_QUESTIONS.map((q, i) => (
            <Question key={q} p={p} i={i} L={L} typed={typed[i] ?? 0} />
          ))}
          <Pictures p={p} L={L} />
          <Veil p={p} L={L} />
          <Mark p={p} L={L} ring={isDark} />
          <Docked p={p} L={L} ring={isDark} />
        </View>

        <View style={StyleSheet.absoluteFill} pointerEvents={ended ? 'box-none' : 'none'}>
          <Rise p={p} i={0} style={{ top: 200 + L.oy, ...wide }}>
            <Text
              style={[styles.endTitle, { color: palette.text }]}
              accessibilityRole="header"
              accessibilityLabel={`Step ${step} of ${total}. ${title}`}
              maxFontSizeMultiplier={TEXT_MAX}
              testID="whats-new-title"
            >
              {title}
            </Text>
          </Rise>
          <Rise p={p} i={1} style={{ top: 254 + L.oy, left: 36, width: L.width - 72 }}>
            <Text style={[styles.endText, { color: palette.secondary }]} accessibilityLabel={MOMENT_WORDS.summary} maxFontSizeMultiplier={TEXT_MAX}>
              {text}
            </Text>
          </Rise>
          <Rise p={p} i={2} style={{ top: 384 + L.oy, ...wide }}>
            {alreadyOn ? (
              <PillButton title={MOMENT_WORDS.next} size="lg" onPress={onNext} testID="whats-new-next" />
            ) : (
              <PillButton title={MOMENT_WORDS.turnOn} size="lg" onPress={() => setOptIn(true)} testID="whats-new-revo-turn-on" />
            )}
          </Rise>
          {alreadyOn ? null : (
            <Rise p={p} i={3} style={{ top: 446 + L.oy, ...wide }}>
              <Tap onPress={onNext} accessibilityRole="button" style={styles.later} testID="whats-new-next">
                <Text style={[styles.laterText, { color: palette.text }]} maxFontSizeMultiplier={TEXT_MAX}>
                  {MOMENT_WORDS.later}
                </Text>
              </Tap>
            </Rise>
          )}
          <Rise p={p} i={4} style={{ top: 520 + L.oy, left: 0, width: L.width }}>
            <View style={styles.centered} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
              <Stepper total={total} current={step} />
            </View>
          </Rise>
          <Rise p={p} i={5} style={{ top: L.button.y - 20, right: REVO_BUTTON_SIZE + 30 }}>
            <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
              <Text style={[styles.hereTitle, { color: palette.text }]} maxFontSizeMultiplier={TEXT_MAX}>
                {MOMENT_WORDS.hereTitle}
              </Text>
              <Text style={[styles.hereLine, { color: palette.secondary }]} maxFontSizeMultiplier={TEXT_MAX}>
                {MOMENT_WORDS.hereLine}
              </Text>
            </View>
          </Rise>
          {ended ? (
            <Tap
              onPress={() => setRun((r) => r + 1)}
              accessibilityRole="button"
              style={[styles.corner, { top: top + 2 }]}
              testID="whats-new-moment-again"
            >
              <Ionicons name="refresh" size={15} color={palette.link} />
              <Text style={[styles.againText, { color: palette.link }]} maxFontSizeMultiplier={TEXT_MAX}>
                {MOMENT_WORDS.again}
              </Text>
            </Tap>
          ) : null}
        </View>
      </Animated.View>

      {/* The one way to the end while it plays: holding the phone or brushing the screen never ends it. */}
      {ended ? null : (
        <Tap
          onPress={skip}
          accessibilityRole="button"
          accessibilityLabel={MOMENT_WORDS.skip}
          style={[styles.corner, { top: top + 2 }]}
          testID="whats-new-moment-skip"
        >
          <View style={[styles.skipPill, { backgroundColor: palette.fill }]}>
            <Text style={[styles.skipText, { color: palette.text }]} maxFontSizeMultiplier={TEXT_MAX}>
              {MOMENT_WORDS.skip}
            </Text>
          </View>
        </Tap>
      )}
      {closable ? (
        <Tap onPress={() => onClose?.()} accessibilityRole="button" accessibilityLabel="Close" hitSlop={12} style={[styles.close, { top: top + 6 }]} testID="whats-new-close">
          <Ionicons name="close" size={26} color={palette.text} />
        </Tap>
      ) : null}

      <Modal visible={optIn} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOptIn(false)}>
        <View style={[styles.fill, { backgroundColor: palette.sheet, paddingBottom: insets.bottom }]} testID="whats-new-revo-optin">
          <RevoOptIn onTurnOn={() => void turnOn()} onNotNow={() => setOptIn(false)} busy={busy} error={error} smartTracking={smartTracking} />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1, minWidth: 0 },
  abs: { position: 'absolute' },
  row: { flexDirection: 'row' },
  centerRow: { position: 'absolute', left: 0, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  centered: { alignItems: 'center' },
  box: { position: 'absolute', left: 0, top: 0, width: BOX, height: BOX },
  glow: { position: 'absolute', left: 0, top: 0, width: GLOW_BOX, height: GLOW_BOX },
  wordmark: { fontSize: 52, lineHeight: 60, fontWeight: '700', letterSpacing: -1.6 },
  tagline: { position: 'absolute', left: 0, textAlign: 'center', fontSize: 17, lineHeight: 24 },
  question: { position: 'absolute', textAlign: 'center', fontSize: 30, lineHeight: 36, fontWeight: '700', letterSpacing: -0.7 },
  example: { fontSize: 12, lineHeight: 16, fontWeight: '600', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, overflow: 'hidden' },
  weekLetter: { position: 'absolute', width: 40, textAlign: 'center', fontSize: 13, lineHeight: 17 },
  caption: { position: 'absolute', left: 30, textAlign: 'center', fontSize: 17, lineHeight: 24 },
  crumb: { borderWidth: 1, borderRadius: 22, paddingHorizontal: 16, height: 44, alignItems: 'center', justifyContent: 'center' },
  crumbText: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  sep: { fontSize: 20 },
  dayCard: { position: 'absolute', borderWidth: 1, borderRadius: 18, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardTitle: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  cardLine: { fontSize: 13, lineHeight: 18 },
  orbitSlot: { position: 'absolute', left: 0, top: 0, width: 280, alignItems: 'center' },
  chip: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 13, height: 36, justifyContent: 'center', maxWidth: 280 },
  chipText: { fontSize: 14, lineHeight: 18, fontWeight: '600' },
  sketchTop: { position: 'absolute', left: 16, right: 16, height: 44, alignItems: 'center', justifyContent: 'center' },
  sketchIcons: { position: 'absolute', right: 0, flexDirection: 'row', gap: 18 },
  sketchPost: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, fontWeight: '600' },
  avatarSmall: { width: 36, height: 36, borderRadius: 18 },
  sketchBar: { borderRadius: 6 },
  sketchPill: { width: 150, height: 40, borderRadius: 20 },
  sketchRow: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  sketchTabs: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'center', gap: 110, paddingTop: 12 },
  sketchTab: { alignItems: 'center', gap: 6 },
  tabDot: { width: 5, height: 5, borderRadius: 2.5 },
  endTitle: { textAlign: 'center', fontSize: 34, lineHeight: 41, fontWeight: '700', letterSpacing: -0.8 },
  endText: { textAlign: 'center', fontSize: 17, lineHeight: 24 },
  later: { height: 44, alignItems: 'center', justifyContent: 'center' },
  laterText: { fontSize: 17, fontWeight: '600' },
  hereTitle: { fontSize: 15, lineHeight: 20, fontWeight: '600', textAlign: 'right' },
  hereLine: { fontSize: 13, lineHeight: 18, textAlign: 'right' },
  /** Skip, then Watch again, in the same top corner: a 44pt target. */
  corner: { position: 'absolute', right: 8, minWidth: 44, height: 44, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  skipPill: { height: 32, borderRadius: 16, paddingHorizontal: 14, justifyContent: 'center' },
  skipText: { fontSize: 15, fontWeight: '600' },
  againText: { fontSize: 14, fontWeight: '600' },
  close: { position: 'absolute', left: 16 },
});
