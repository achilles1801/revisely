// The picked day under Overview's calendar, as one entry (ACT-34, Revisely Dev; Majd, Nov 23 2026: its rows "show up as if they're
// separate clicks + there's an Open button and they all do the same thing"). The date and a line for each thing that happened, the
// note last when there is one, are one button that opens the day. With no note, "Add a note" is the entry's one other action.

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Tap } from '../v2/Tap';
import { ProgressRing } from './DayParts';
import { useTheme } from '../../context/ThemeContext';
import { ramadanV2, typeV2 } from '../../theme/v2';
import { Crescent } from '../ramadan/art';
import { forwardIcon } from '../../i18n/direction';
import { formatNumber, t } from '../../i18n';

/** Chrome text stops growing here, as the calendar's does. */
const MAX_SCALE = 1.4;

/** C2's day (ACT-35, Majd's pick on the v2 boards): the revision as a ring and its figure, the rest in one grey line. */
export interface DayEntryRing {
  /** Of the day's plan, 0–1 (1 for pages logged with no plan). */
  share: number;
  /** "20 of 20", or how many pages with no plan. */
  figure: string;
  /** Where and how long: "Juz 28 · 31 min". */
  detail?: string;
}

/** One of the other kinds, as the calendar marks it: memorized and read a dot, recited a mic, a spot test its icon. */
export interface DayEntryExtra {
  key: 'memorized' | 'read' | 'recited' | 'spot';
  text: string;
}

export interface DayEntryLine {
  key: string;
  label: string;
  /** What happened, in a few words: one line, cut rather than shrunk (Majd, Nov 23 2026). */
  value: string;
  /** How much, always shown after it: "31 min", "4 takes". */
  tail?: string;
  /** Recordings beside this line. */
  mics?: number;
}

export function DayEntry({
  date,
  lines,
  note,
  onOpen,
  onAddNote,
  showNote = true,
  ring,
  extras = [],
  hijri,
}: {
  /** "Wednesday 28 October". */
  date: string;
  lines: DayEntryLine[];
  /** The day's note, when it has one. */
  note: string | null;
  onOpen: () => void;
  onAddNote: () => void;
  /** The one Activity tab (ACT-35) shows no note here (Majd, Nov 25 2026: "it adds to the overstimulation"); the day has it. */
  showNote?: boolean;
  /** C2's form (the one Activity tab): the revision as a ring, the other kinds in one grey line; no note, no Add a note. */
  ring?: DayEntryRing | null;
  extras?: DayEntryExtra[];
  /** The Ramadan theme (THEME-6): the day's Hijri date in Ramadan or Eid, "12 Ramadan", beside the date. */
  hijri?: string | null;
}) {
  const { palette, isDark } = useTheme();
  const shownNote = showNote ? note : null;
  const spoken = [date, ...lines.map((l) => `${l.label}, ${l.value}${l.tail ? `, ${l.tail}` : ''}`), ...(shownNote ? [`${t('activity.calendar.note')}, ${shownNote}`] : [])].join('. ');
  if (ring !== undefined) {
    const said = [hijri ? `${date}, ${hijri}` : date, ring ? `${ring.figure} ${t('activity.oneTab.revised')}${ring.detail ? `, ${ring.detail}` : ''}` : null, ...extras.map((e) => e.text)]
      .filter(Boolean)
      .join('. ');
    const mark = (key: DayEntryExtra['key']) =>
      key === 'memorized' || key === 'read' ? (
        <View style={[styles.markDot, { backgroundColor: key === 'memorized' ? palette.primary : palette.text }]} />
      ) : (
        <Ionicons name={key === 'recited' ? 'mic-outline' : 'shuffle'} size={14} color={palette.secondary} />
      );
    return (
      <View style={styles.entry} testID="calendar-preview">
        <Tap onPress={onOpen} accessibilityRole="button" accessibilityLabel={said || date} accessibilityHint={t('activity.calendar.openTheDay')} style={styles.open} testID="preview-open">
          <View style={styles.head}>
            <View style={styles.dateRow}>
              <Text style={[styles.date, { color: palette.text }]} numberOfLines={2} maxFontSizeMultiplier={MAX_SCALE} testID="preview-date">
                {date}
              </Text>
              {hijri ? (
                <View style={styles.hijri} testID="preview-hijri">
                  <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                    <Crescent size={12} tokens={ramadanV2(isDark, palette.accent)} />
                  </View>
                  <Text style={[typeV2.meta, { color: palette.secondary }]} numberOfLines={1} maxFontSizeMultiplier={MAX_SCALE}>
                    {hijri}
                  </Text>
                </View>
              ) : null}
            </View>
            <Ionicons name={forwardIcon()} size={18} color={palette.secondary} />
          </View>
          {ring ? (
            <View style={styles.ringRow} testID="preview-ring">
              <ProgressRing fraction={ring.share} done={ring.share >= 1} size={44} />
              <View style={styles.shrink}>
                <Text style={[styles.ringFigure, { color: palette.text }]} numberOfLines={1} maxFontSizeMultiplier={MAX_SCALE} testID="preview-ring-figure">
                  {ring.figure}
                  <Text style={[typeV2.body, { color: palette.secondary }]}>{` ${t('activity.oneTab.revised')}`}</Text>
                </Text>
                {ring.detail ? (
                  <Text style={[typeV2.meta, { color: palette.secondary }]} numberOfLines={1} maxFontSizeMultiplier={MAX_SCALE}>
                    {ring.detail}
                  </Text>
                ) : null}
              </View>
            </View>
          ) : null}
          {extras.length > 0 ? (
            <View style={[styles.extras, ring ? styles.extrasUnderRing : null]} testID="preview-extras">
              {extras.map((e) => (
                <View key={e.key} style={styles.extra} testID={`preview-extra-${e.key}`}>
                  {mark(e.key)}
                  <Text style={[typeV2.meta, { color: palette.secondary }]} numberOfLines={1} maxFontSizeMultiplier={MAX_SCALE}>
                    {e.text}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
          {!ring && extras.length === 0 ? (
            <Text style={[typeV2.body, styles.nothing, { color: palette.secondary }]} maxFontSizeMultiplier={MAX_SCALE} testID="preview-nothing">
              {t('activity.calendar.entryNothing')}
            </Text>
          ) : null}
        </Tap>
      </View>
    );
  }
  const label = [typeV2.body, styles.label, { color: palette.secondary }];
  const value = [typeV2.body, styles.value, { color: palette.text }];
  return (
    <View style={styles.entry} testID="calendar-preview">
      <Tap onPress={onOpen} accessibilityRole="button" accessibilityLabel={spoken} accessibilityHint={t('activity.calendar.openTheDay')} style={styles.open} testID="preview-open">
        <View style={styles.head}>
          <Text style={[styles.date, { color: palette.text }]} numberOfLines={2} maxFontSizeMultiplier={MAX_SCALE} testID="preview-date">
            {date}
          </Text>
          <Ionicons name={forwardIcon()} size={18} color={palette.secondary} />
        </View>
        {lines.map((l) => (
          <View key={l.key} style={styles.line} testID={`preview-row-${l.key}`}>
            <Text style={label} numberOfLines={1} maxFontSizeMultiplier={MAX_SCALE}>
              {l.label}
            </Text>
            <View style={styles.valueRow}>
              <Text style={[typeV2.body, styles.shrink, { color: palette.text }]} numberOfLines={1} maxFontSizeMultiplier={MAX_SCALE} testID={`preview-value-${l.key}`}>
                {l.value}
              </Text>
              {l.tail ? (
                <Text style={[typeV2.body, { color: palette.text }]} numberOfLines={1} maxFontSizeMultiplier={MAX_SCALE} testID={`preview-tail-${l.key}`}>
                  {` · ${l.tail}`}
                </Text>
              ) : null}
            </View>
            {l.mics ? (
              <View style={styles.mics} testID={`preview-mics-${l.key}`}>
                <Ionicons name="mic-outline" size={13} color={palette.secondary} />
                <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={MAX_SCALE}>
                  {formatNumber(l.mics)}
                </Text>
              </View>
            ) : null}
          </View>
        ))}
        {shownNote ? (
          <View style={styles.line} testID="preview-row-notes">
            <Text style={label} numberOfLines={1} maxFontSizeMultiplier={MAX_SCALE}>
              {t('activity.calendar.note')}
            </Text>
            <Text style={value} numberOfLines={2} maxFontSizeMultiplier={MAX_SCALE} testID="preview-value-notes">
              {shownNote}
            </Text>
          </View>
        ) : null}
        {lines.length === 0 && !shownNote ? (
          <Text style={[typeV2.body, styles.nothing, { color: palette.secondary }]} maxFontSizeMultiplier={MAX_SCALE} testID="preview-nothing">
            {t('activity.calendar.entryNothing')}
          </Text>
        ) : null}
      </Tap>
      {note ? null : (
        <Tap onPress={onAddNote} accessibilityRole="button" accessibilityLabel={t('activity.calendar.entryAddNote')} style={styles.addNote} testID="preview-add-note">
          <Ionicons name="create-outline" size={17} color={palette.link} />
          <Text style={[typeV2.body, { color: palette.link }]} maxFontSizeMultiplier={MAX_SCALE}>
            {t('activity.calendar.entryAddNote')}
          </Text>
        </Tap>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  entry: { paddingTop: 10, paddingBottom: 4 },
  open: { paddingHorizontal: 16, paddingBottom: 2 },
  head: { minHeight: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  date: { flexShrink: 1, fontSize: 17, lineHeight: 22, fontWeight: '600' },
  dateRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 8, flexShrink: 1 },
  hijri: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 4 },
  label: { width: 92 },
  value: { flex: 1, minWidth: 0 },
  valueRow: { flex: 1, minWidth: 0, flexDirection: 'row' },
  shrink: { flexShrink: 1 },
  mics: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingTop: 2 },
  nothing: { paddingVertical: 4 },
  ringRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 8 },
  ringFigure: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  extras: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 4, marginTop: 10, paddingBottom: 4 },
  // Under the ring's words, as the board draws it.
  extrasUnderRing: { paddingStart: 58 },
  extra: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  markDot: { width: 6, height: 6, borderRadius: 3 },
  addNote: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 36, paddingHorizontal: 16 },
});
