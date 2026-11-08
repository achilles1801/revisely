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
import { RevoMark } from '../revo/RevoMark';

/** The words the pictures show, as the screens they're drawn from show them (pictures.test.ts). */
export const PICTURE_WORDS = {
  addTitle: 'Add to today',
  rows: [
    ['Revised elsewhere', 'Today’s pages, revised away from a session'],
    ['Memorized', 'New pages you learned today'],
    ['Note', 'A thought, or a mistake to watch'],
  ],
  revoQuestion: 'How was my week?',
  revoChips: ['What should I revise next?', 'How is my pace?'],
  revoPlaceholder: 'Ask Revo anything',
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
    <View>
      {/* The day behind, dimmed. */}
      <View style={[styles.behind, { backgroundColor: palette.overlay }]} />
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

function AyahPicture() {
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

// ------------------------------------------------------------------ 4. Revo's sheet

function RevoPicture() {
  const { palette } = useTheme();
  const text = (style: object, children: React.ReactNode, lines?: number) => (
    <Text style={style} maxFontSizeMultiplier={1} numberOfLines={lines}>
      {children}
    </Text>
  );
  return (
    <View style={[styles.revoSheet, { backgroundColor: palette.sheet }]}>
      <View style={[styles.handle, { backgroundColor: palette.handle }]} />
      <View style={styles.revoHead}>
        <View style={[styles.revoPill, { backgroundColor: palette.bubble }]}>
          <RevoMark size={28} />
          {text([typeV2.name, { color: palette.text }], 'Revo')}
        </View>
        <View style={styles.flex} />
        <Ionicons name="time-outline" size={22} color={palette.text} />
      </View>
      <View style={[styles.question, { backgroundColor: palette.primary }]}>
        {text([typeV2.body, { color: palette.onPrimary }], PICTURE_WORDS.revoQuestion)}
      </View>
      {text(
        [styles.answer, { color: palette.text }],
        'A good week, Maryam: you revised on 5 of the last 7 days, Juz 27 to Juz 30. Today is Al-Mujadila to At-Tahrim. Start there while it’s quiet?',
      )}
      <View style={styles.feedback}>
        {(['copy-outline', 'thumbs-up-outline', 'thumbs-down-outline'] as const).map((n) => (
          <Ionicons key={n} name={n} size={19} color={palette.secondary} />
        ))}
      </View>
      <View style={styles.chips}>
        {PICTURE_WORDS.revoChips.map((c) => (
          <View key={c} style={[styles.revoChip, { borderColor: palette.outline }]}>
            {text([typeV2.button, { color: palette.text }], c, 1)}
          </View>
        ))}
      </View>
      <View style={styles.composer}>
        <View style={[styles.plus, { backgroundColor: palette.bubble }]}>
          <Ionicons name="add" size={24} color={palette.text} />
        </View>
        <View style={[styles.field, { backgroundColor: palette.bubble, borderColor: palette.outline }]}>
          {text([typeV2.body, styles.flex, { color: palette.secondary }], PICTURE_WORDS.revoPlaceholder, 1)}
          <Ionicons name="mic-outline" size={20} color={palette.text} />
        </View>
      </View>
    </View>
  );
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
    case 'revo':
      return (
        <Window anchor="top" testID="whats-new-picture-revo">
          <RevoPicture />
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
  behind: { height: 120 },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 16, paddingBottom: 10, marginTop: -20 },
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
  revoSheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 16, paddingBottom: 12, marginTop: 12 },
  revoHead: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  revoPill: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 36, borderRadius: 18, paddingLeft: 4, paddingRight: 14 },
  question: { alignSelf: 'flex-end', maxWidth: 270, borderRadius: 18, borderBottomRightRadius: 4, paddingHorizontal: 14, paddingVertical: 9, marginTop: 14 },
  answer: { fontSize: 19, lineHeight: 27, letterSpacing: -0.3, marginTop: 16 },
  feedback: { flexDirection: 'row', gap: 22, marginTop: 14 },
  chips: { flexDirection: 'row', gap: 8, marginTop: 18, overflow: 'hidden' },
  revoChip: { height: 36, borderRadius: 18, borderWidth: 1, paddingHorizontal: 14, justifyContent: 'center' },
  composer: { flexDirection: 'row', gap: 10, marginTop: 12 },
  plus: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  field: { flex: 1, height: 44, borderRadius: 22, borderWidth: 1, paddingLeft: 16, paddingRight: 14, flexDirection: 'row', alignItems: 'center' },
});
