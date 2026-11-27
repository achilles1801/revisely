// The tour's pieces (What's new 1.0.6, lib/whatsNew/tour): a screen of the app floating on the stage with a camera over
// it (no finger on it: Majd, Nov 26 2026, what's tapped answers by itself), a glint, and the bits of the app's screens the slides draw (a sheet, Revo's header, a bubble,
// the field). Everything here is a picture: drawn at a phone's 402 × 874, never touched, its text at a fixed size
// (the card's words, under it, follow Dynamic Type). Animated on the UI thread from one clock per slide.

import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextProps, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../context/ThemeContext';
import { RevoMark } from '../../revo/RevoMark';
import { PHONE, SCREEN_AT, STAGE, bump } from '../../../lib/whatsNew/tour';

export type Clock = SharedValue<number>;
type Style = ViewStyle & { opacity?: number };

/** A place on the phone (or the stage): left, top, width, height. */
export function at(left: number, top: number, width?: number, height?: number): ViewStyle {
  return { position: 'absolute', left, top, ...(width != null ? { width } : {}), ...(height != null ? { height } : {}) };
}

/** Text in a picture: a fixed size, whatever the phone's text size. */
export function T(props: TextProps) {
  return <Text allowFontScaling={false} {...props} />;
}

/** A piece that moves with the clock: `style` is a worklet of the slide's seconds. */
export function Anim({ t, style, box, children }: { t: Clock; style: (t: number) => Style; box?: StyleProp<ViewStyle>; children?: React.ReactNode }) {
  const animated = useAnimatedStyle(() => style(t.value) as never);
  return (
    <Animated.View pointerEvents="none" style={[box, animated]}>
      {children}
    </Animated.View>
  );
}

/** Where a screen stands on the stage, and where the camera is on it. */
export interface ScreenAt {
  scale?: number;
  top?: number;
  dx?: number;
  rot?: number;
  opacity?: number;
  /** The camera pushing in: `zoom` on the phone's point (ox, oy). */
  zoom?: number;
  ox?: number;
  oy?: number;
}

/**
 * A screen of the app floating on the stage: a phone's 402 × 874, rounded, scaled and placed by `place` (a worklet of
 * the slide's seconds), with the camera inside it. Its children draw in the phone's points.
 */
export function Screen({ t, place, children, ground }: { t: Clock; place: (t: number) => ScreenAt; children: React.ReactNode; ground?: string }) {
  const { palette, isDark } = useTheme();
  const outer = useAnimatedStyle(() => {
    const f = place(t.value);
    const s = f.scale ?? SCREEN_AT.scale;
    const left = (STAGE.width - PHONE.width * s) / 2 + (f.dx ?? 0);
    const top = f.top ?? SCREEN_AT.top;
    return {
      opacity: f.opacity ?? 1,
      transform: [
        { translateX: left + (PHONE.width * s) / 2 - PHONE.width / 2 },
        { translateY: top + (PHONE.height * s) / 2 - PHONE.height / 2 },
        { rotate: `${f.rot ?? 0}deg` },
        { scale: s },
      ],
    };
  });
  const camera = useAnimatedStyle(() => {
    const f = place(t.value);
    const z = f.zoom ?? 1;
    const ox = f.ox ?? PHONE.width / 2;
    const oy = f.oy ?? PHONE.height / 2;
    return {
      transform: [{ translateX: (ox - PHONE.width / 2) * (1 - z) }, { translateY: (oy - PHONE.height / 2) * (1 - z) }, { scale: z }],
    };
  });
  return (
    <Animated.View pointerEvents="none" style={[styles.phone, isDark ? { borderWidth: 1, borderColor: palette.outline } : [styles.lifted, { shadowColor: palette.shadow }], outer]}>
      <View style={[styles.phoneClip, { backgroundColor: ground ?? palette.bg }]}>
        <Animated.View style={[StyleSheet.absoluteFill, camera]}>{children}</Animated.View>
      </View>
    </Animated.View>
  );
}

const STAR = 'M0,-10 C1,-2 2,-1 10,0 C2,1 1,2 0,10 C-1,2 -2,1 -10,0 C-2,-1 -1,-2 0,-10Z';

/** A four-point sparkle passing over something, over its life `u`. */
export function Glint({ t, where, color, size = 22 }: { t: Clock; where: (t: number) => [number, number, number]; color: string; size?: number }) {
  const style = useAnimatedStyle(() => {
    const [x, y, u] = where(t.value);
    const k = bump(u);
    return { opacity: k, transform: [{ translateX: x - size / 2 }, { translateY: y - size / 2 }, { scale: 0.3 + 0.7 * k }, { rotate: `${u * 90}deg` }] };
  });
  return (
    <Animated.View pointerEvents="none" style={[styles.abs, { width: size, height: size }, style]}>
      <Svg width={size} height={size} viewBox="-10 -10 20 20">
        <Path d={STAR} fill={color} />
      </Svg>
    </Animated.View>
  );
}

/** A ring going out from (x, y): `u` its life. */
export function Ripple({ t, where, color, r = 20, width = 2 }: { t: Clock; where: (t: number) => [number, number, number]; color: string; r?: number; width?: number }) {
  const style = useAnimatedStyle(() => {
    const [x, y, u] = where(t.value);
    const shown = u > 0 && u < 1;
    return { opacity: shown ? (1 - u) * 0.8 : 0, transform: [{ translateX: x - r }, { translateY: y - r }, { scale: 0.6 + 1.4 * u }] };
  });
  return <Animated.View pointerEvents="none" style={[styles.abs, { width: 2 * r, height: 2 * r, borderRadius: r, borderWidth: width, borderColor: color }, style]} />;
}

// ------------------------------------------------------------------ the app's bits, drawn

/** A sheet from `top` to the phone's foot, with its handle; `dim` darkens what's behind it. */
export function Sheet({ top, children, dim = true }: { top: number; children: React.ReactNode; dim?: boolean }) {
  const { palette } = useTheme();
  return (
    <>
      {dim ? <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.overlay }]} /> : null}
      <View style={[at(0, top, PHONE.width, PHONE.height - top), styles.sheet, { backgroundColor: palette.sheet }]}>
        <View style={[styles.handle, { backgroundColor: palette.handle }]} />
        {children}
      </View>
    </>
  );
}

/** Revo's sheet's header: the R, "Revo", and Memory. */
export function RevoHeader() {
  const { palette } = useTheme();
  return (
    <View style={styles.revoHead}>
      <RevoMark size={30} />
      <T style={[styles.name, { color: palette.text }]}>Revo</T>
      <View style={styles.flex} />
      <Ionicons name="time-outline" size={20} color={palette.text} />
      <T style={[styles.meta, { color: palette.text, marginStart: 14 }]}>Memory</T>
    </View>
  );
}

/** Revo's words. */
export function Say({ children, size = 17 }: { children: React.ReactNode; size?: number }) {
  const { palette } = useTheme();
  return <T style={[styles.say, { color: palette.text, fontSize: size, lineHeight: Math.round(size * 1.42) }]}>{children}</T>;
}

/** What the account asked, in its bubble. */
export function Asked({ children }: { children: React.ReactNode }) {
  const { palette } = useTheme();
  return (
    <View style={[styles.asked, { backgroundColor: palette.primary }]}>
      <T style={[styles.body, { color: palette.onPrimary }]}>{children}</T>
    </View>
  );
}

export function Chips({ items }: { items: readonly string[] }) {
  const { palette } = useTheme();
  return (
    <View style={styles.chips}>
      {items.map((c) => (
        <View key={c} style={[styles.chip, { borderColor: palette.outline }]}>
          <T style={[styles.button, { color: palette.text }]} numberOfLines={1}>
            {c}
          </T>
        </View>
      ))}
    </View>
  );
}

/** Revo's field, ending in its own mic (REVO-42). */
export function Field({ placeholder }: { placeholder: string }) {
  const { palette } = useTheme();
  return (
    <View style={styles.fieldRow}>
      <View style={[styles.plus, { backgroundColor: palette.fill }]}>
        <Ionicons name="add" size={22} color={palette.text} />
      </View>
      <View style={[styles.field, { borderColor: palette.outline }]}>
        <T style={[styles.body, styles.flex, { color: palette.secondary }]}>{placeholder}</T>
        <Ionicons name="mic-outline" size={20} color={palette.text} />
      </View>
    </View>
  );
}

/** A top bar: back, a title, and what's on its end. */
export function Bar({ title, end, back = true }: { title: string; end?: React.ReactNode; back?: boolean }) {
  const { palette } = useTheme();
  return (
    <View style={[at(0, 62, PHONE.width, 44), styles.bar]}>
      <View style={styles.barSide}>{back ? <Ionicons name="chevron-back" size={26} color={palette.text} /> : null}</View>
      <T style={[styles.barTitle, { color: palette.text }]} numberOfLines={1}>
        {title}
      </T>
      <View style={[styles.barSide, styles.barEnd]}>{end}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  abs: { position: 'absolute', left: 0, top: 0 },
  flex: { flex: 1 },
  phone: { position: 'absolute', left: 0, top: 0, width: PHONE.width, height: PHONE.height, borderRadius: 48 },
  lifted: { shadowOpacity: 0.16, shadowRadius: 30, shadowOffset: { width: 0, height: 22 }, elevation: 10 },
  phoneClip: { flex: 1, borderRadius: 48, overflow: 'hidden' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16 },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 6 },
  revoHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  name: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  meta: { fontSize: 13, lineHeight: 18 },
  body: { fontSize: 15, lineHeight: 20 },
  button: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  say: { marginTop: 14, letterSpacing: -0.2 },
  asked: { alignSelf: 'flex-end', marginTop: 10, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9, maxWidth: 300 },
  chips: { flexDirection: 'row', gap: 8, marginTop: 'auto', marginBottom: 12, flexWrap: 'nowrap' },
  chip: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 40 },
  plus: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  field: { flex: 1, height: 44, borderRadius: 22, borderWidth: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  barSide: { width: 72 },
  barEnd: { alignItems: 'flex-end' },
  barTitle: { flex: 1, textAlign: 'center', fontSize: 17, lineHeight: 22, fontWeight: '600' },
});

