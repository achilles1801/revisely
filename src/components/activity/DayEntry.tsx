// The picked day under Overview's calendar, as one entry (ACT-34, Revisely Dev; Majd, Nov 23 2026: its rows "show up as if they're
// separate clicks + there's an Open button and they all do the same thing"). The date and a line for each thing that happened, the
// note last when there is one, are one button that opens the day. With no note, "Add a note" is the entry's one other action.

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Tap } from '../v2/Tap';
import { useTheme } from '../../context/ThemeContext';
import { typeV2 } from '../../theme/v2';
import { forwardIcon } from '../../i18n/direction';
import { formatNumber, t } from '../../i18n';

/** Chrome text stops growing here, as the calendar's does. */
const MAX_SCALE = 1.4;

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
}) {
  const { palette } = useTheme();
  const shownNote = showNote ? note : null;
  const spoken = [date, ...lines.map((l) => `${l.label}, ${l.value}${l.tail ? `, ${l.tail}` : ''}`), ...(shownNote ? [`${t('activity.calendar.note')}, ${shownNote}`] : [])].join('. ');
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
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 4 },
  label: { width: 92 },
  value: { flex: 1, minWidth: 0 },
  valueRow: { flex: 1, minWidth: 0, flexDirection: 'row' },
  shrink: { flexShrink: 1 },
  mics: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingTop: 2 },
  nothing: { paddingVertical: 4 },
  addNote: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 36, paddingHorizontal: 16 },
});
