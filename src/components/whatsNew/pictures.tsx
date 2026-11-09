// The cards' pictures (the approved mocks, whats-new/png): a window onto the part of the screen each
// card is about, its far edge fading into the page. Drawn by the app's own pieces in the account's
// theme and accent: the Overview month is Activity's own CalendarMonth, the + sheet's marks are the
// day blocks' marks. Demo data only, named by surahs and juz (NAME-1). Decoration: hidden from
// VoiceOver (the card's words say it all), never touched, and gone past 1.6× text (WhatsNewScreen).
// The words in them are the app's own, which pictures.test.ts checks against the screens they show.

import React, { useId } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { typeV2 } from '../../theme/v2';
import type { WhatsNewPicture } from '../../lib/help/whatsNew';
import { weekStart } from '../../lib/activityHeatmap';
import { BlockMark, RevisedMark } from '../activity/BlockMark';
import { CalendarMonth, type CalendarData } from '../activity/CalendarMonth';

/** The words the pictures show, as the screens they're drawn from show them (pictures.test.ts). */
export const PICTURE_WORDS = {
  addTitle: 'Add to today',
  rows: [
    ['Revised elsewhere', 'Today’s pages, revised away from a session'],
    ['Memorized', 'New pages you learned today'],
    ['Note', 'A thought, or a mistake to watch'],
  ],
} as const;

const FADE = 56;
const nop = () => undefined;

function Fade({ edge }: { edge: 'top' | 'bottom' }) {
  const { palette } = useTheme();
  const id = `fade${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <View pointerEvents="none" style={[styles.fade, edge === 'bottom' ? { bottom: 0 } : { top: 0 }]}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={palette.bg} stopOpacity={edge === 'bottom' ? 0 : 1} />
            <Stop offset="1" stopColor={palette.bg} stopOpacity={edge === 'bottom' ? 1 : 0} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/** The window: the screen's part from its top (`top`) or its foot (`bottom`), the other edge fading. */
function Window({ anchor, children, testID }: { anchor: 'top' | 'bottom'; children: React.ReactNode; testID: string }) {
  const { palette } = useTheme();
  return (
    <View
      style={[styles.window, { borderColor: palette.outline, backgroundColor: palette.bg }]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={testID}
    >
      <View style={[StyleSheet.absoluteFill, { justifyContent: anchor === 'top' ? 'flex-start' : 'flex-end' }]}>{children}</View>
      <Fade edge={anchor === 'top' ? 'bottom' : 'top'} />
    </View>
  );
}

// ------------------------------------------------------------------ 1. Activity's Overview month

const MONTH = '2026-10';
const TODAY = '2026-10-29';
const day = (d: number) => `${MONTH}-${String(d).padStart(2, '0')}`;
const range = (from: number, n: number) => Array.from({ length: n }, (_, i) => from + i);

/** A month of revision, mostly every day, with a few days memorized, read and noted. */
function demoMonth(): CalendarData {
  const days = range(1, 29).filter((d) => d !== 6 && d !== 20);
  return {
    revised: days.map((d) => {
      const start = 542 + ((d * 20) % 60);
      const assigned = range(start, 20);
      const done = d % 9 === 4 ? assigned.slice(0, 12) : assigned;
      return { day: day(d), pages: done, assigned, minutes: 30 + (d % 5) * 4, countsFor: day(d) };
    }),
    memorized: [5, 12, 19, 26, 29].map((d) => ({ day: day(d), pages: [562] })),
    read: [3, 10, 17, 24].map((d) => ({ day: day(d), pages: range(1, 2), minutes: 15 })),
    noteDays: new Set([8, 15, 22, 29].map(day)),
  };
}

function ActivityPicture() {
  return (
    <View style={styles.screen}>
      <CalendarMonth
        month={MONTH}
        week={weekStart(TODAY)}
        span="month"
        onSpan={nop}
        today={TODAY}
        picked={TODAY}
        data={demoMonth()}
        onStep={nop}
        onPick={nop}
        onOpen={nop}
      />
    </View>
  );
}

// ------------------------------------------------------------------ 2. The day's + sheet

function ElsewherePicture() {
  const { palette } = useTheme();
  const marks = [
    <RevisedMark key="r" fraction={0.9} done={false} />,
    <BlockMark key="m" kind="memorized" />,
    <BlockMark key="n" kind="notes" />,
  ];
  return (
    <View style={styles.fill}>
      {/* The day behind, dimmed, taking whatever room the sheet leaves. */}
      <View style={StyleSheet.absoluteFill}>
        <Day />
      </View>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.overlay }]} />
      <View style={[styles.sheet, { backgroundColor: palette.sheet }]}>
        <View style={[styles.handle, { backgroundColor: palette.handle }]} />
        <Text style={[typeV2.sheetTitle, styles.center, { color: palette.text }]} maxFontSizeMultiplier={1}>
          {PICTURE_WORDS.addTitle}
        </Text>
        {PICTURE_WORDS.rows.map(([title, sub], i) => (
          <View
            key={title}
            style={[styles.addRow, i < PICTURE_WORDS.rows.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.separator }]}
          >
            {marks[i]}
            <View style={styles.flex}>
              <Text style={[styles.rowTitle, { color: palette.text }]} maxFontSizeMultiplier={1}>
                {title}
              </Text>
              <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={1} numberOfLines={1}>
                {sub}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={palette.secondary} />
          </View>
        ))}
      </View>
    </View>
  );
}

// ------------------------------------------------------------------ 3. A day after a reader sitting

const BARS = [6, 10, 14, 9, 16, 12, 18, 11, 7, 15, 19, 13, 8, 12, 17, 10, 14, 9, 16, 11, 6, 13, 18, 12, 9, 15];

/** Today in Activity after a reader sitting: its Memorized block with the sitting and its recording. */
function Day() {
  const { palette } = useTheme();
  const text = (style: object, children: React.ReactNode) => (
    <Text style={style} maxFontSizeMultiplier={1} numberOfLines={1}>
      {children}
    </Text>
  );
  return (
    <View style={styles.screen}>
      <View style={styles.dayHeader}>
        {text([typeV2.barTitle, styles.center, { color: palette.text }], 'Today')}
        {text([typeV2.meta, styles.center, { color: palette.secondary }], 'Tuesday 3 November')}
      </View>
      <View style={styles.block}>
        <View style={styles.markCol}>
          <BlockMark kind="memorized" />
          <View style={[styles.thread, { backgroundColor: palette.separator }]} />
        </View>
        <View style={styles.flex}>
          <View style={styles.blockHead}>
            {text([typeV2.name, styles.flex, { color: palette.text }], 'Memorized')}
            {text([typeV2.name, { color: palette.text }], '20 ayahs')}
          </View>
          {text([typeV2.meta, { color: palette.secondary }], 'Al-Mulk 1–20 · 25 min')}
          <View style={[styles.chip, { backgroundColor: palette.bubble }]}>
            {text([typeV2.meta, { color: palette.text }], 'Al-Mulk 21–26 finishes the page')}
          </View>
          <View style={styles.item}>
            <Ionicons name="stopwatch-outline" size={18} color={palette.secondary} />
            {text([typeV2.body, styles.flex, { color: palette.text }], 'Al-Mulk, ayahs 1–26')}
            {text([typeV2.meta, { color: palette.secondary }], '41 min')}
          </View>
          <View style={[styles.voice, { backgroundColor: palette.bubble }]}>
            <View style={[styles.play, { backgroundColor: palette.fill }]}>
              <Ionicons name="play" size={16} color={palette.text} />
            </View>
            <View style={styles.bars}>
              {BARS.map((h, i) => (
                <View key={i} style={[styles.bar, { height: h, backgroundColor: palette.secondary }]} />
              ))}
            </View>
            {text([typeV2.meta, { color: palette.secondary }], '4:30')}
          </View>
        </View>
      </View>
    </View>
  );
}

function AyahPicture() {
  return <Day />;
}

export function pictureFor(picture: WhatsNewPicture): React.ReactNode {
  switch (picture) {
    case 'activity':
      return (
        <Window anchor="top" testID="whats-new-picture-activity">
          <ActivityPicture />
        </Window>
      );
    case 'elsewhere':
      return (
        <Window anchor="bottom" testID="whats-new-picture-elsewhere">
          <ElsewherePicture />
        </Window>
      );
    case 'ayah':
      return (
        <Window anchor="top" testID="whats-new-picture-ayah">
          <AyahPicture />
        </Window>
      );
  }
}

const styles = StyleSheet.create({
  window: { flex: 1, minHeight: 150, borderRadius: 24, borderWidth: 1, overflow: 'hidden' },
  fade: { position: 'absolute', left: 0, right: 0, height: FADE },
  screen: { paddingHorizontal: 16, paddingTop: 14 },
  flex: { flex: 1, minWidth: 0 },
  center: { textAlign: 'center' },
  fill: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 16, paddingBottom: 10 },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 8, marginBottom: 12 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rowTitle: { fontSize: 16, lineHeight: 20, fontWeight: '600', letterSpacing: -0.3 },
  dayHeader: { paddingBottom: 14 },
  block: { flexDirection: 'row', gap: 12 },
  markCol: { alignItems: 'center' },
  thread: { width: 2, flex: 1, marginTop: 6, borderRadius: 1 },
  blockHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chip: { alignSelf: 'flex-start', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6, marginTop: 10 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  voice: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 26, padding: 6, paddingRight: 16, marginTop: 12 },
  play: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  bars: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 3, overflow: 'hidden' },
  bar: { width: 3, borderRadius: 1.5 },
});
