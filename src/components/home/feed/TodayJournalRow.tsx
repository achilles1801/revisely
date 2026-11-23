// Home's one way into today's journal (HOME-2, Revisely Dev; Majd, Nov 23 2026: the journal is "a rly big piece of this app and it's
// almost hidden", "but i wanna avoid clutter on the home page"). One quiet row under Today: today's note when there is one, else
// "Add a note". It opens today's journal.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { Tap } from '../../v2/Tap';
import { useTheme } from '../../../context/ThemeContext';
import * as firestoreService from '../../../services/firestoreService';
import { firstNoteText } from '../../../lib/journal';
import { logger } from '../../../lib/logger';
import { subscribeOutbox } from '../../../lib/offline/outbox';
import { currentAccount, withPendingJournalDay } from '../../../lib/offline/queue';
import { layoutV2, typeV2 } from '../../../theme/v2';
import { forwardIcon } from '../../../i18n/direction';
import { t } from '../../../i18n';

/** The day's note as the server has it, with what's still waiting to be sent laid over it. Read on focus and on each change. */
function useDayNote(day: string): string | null {
  const [note, setNote] = useState<string | null>(null);
  const served = useRef<{ day: string; entry: Awaited<ReturnType<typeof firestoreService.getJournalEntry>> } | null>(null);
  const show = useCallback(() => {
    const base = served.current?.day === day ? served.current.entry : null;
    setNote(firstNoteText(withPendingJournalDay(day, base, currentAccount())));
  }, [day]);
  const load = useCallback(() => {
    let live = true;
    show();
    firestoreService
      .getJournalEntry(day)
      .then((entry) => {
        if (!live) return;
        served.current = { day, entry };
        show();
      })
      .catch((err) => logger.warn('Could not read today’s journal', err));
    return () => {
      live = false;
    };
  }, [day, show]);
  useFocusEffect(load);
  useEffect(
    () =>
      subscribeOutbox((uid) => {
        if (uid === currentAccount()) show();
      }),
    [show],
  );
  return note;
}

export function TodayJournalRow({ day, onOpen }: { day: string; onOpen: () => void }) {
  const { palette } = useTheme();
  const note = useDayNote(day);
  const detail = note ?? t('home.screen.journalAddNote');
  return (
    <View style={[styles.rules, { borderColor: palette.separator }]}>
      <Tap
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${t('home.screen.journal')}, ${detail}`}
        style={styles.row}
        testID="today-journal"
      >
        <Ionicons name="create-outline" size={22} color={palette.text} />
        <Text style={[typeV2.body, { color: palette.text }]} numberOfLines={1} maxFontSizeMultiplier={1.4}>
          {t('home.screen.journal')}
        </Text>
        <Text style={[typeV2.body, styles.detail, { color: palette.secondary }]} numberOfLines={1} maxFontSizeMultiplier={1.4} testID="today-journal-detail">
          {detail}
        </Text>
        <Ionicons name={forwardIcon()} size={18} color={palette.secondary} />
      </Tap>
    </View>
  );
}

const styles = StyleSheet.create({
  rules: { borderTopWidth: layoutV2.hairline, borderBottomWidth: layoutV2.hairline },
  row: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: layoutV2.gutter, paddingVertical: 10 },
  detail: { flex: 1, minWidth: 0 },
});
