import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { useTheme } from '../../context/ThemeContext';
import { layoutV2, typeV2 } from '../../theme/v2';
import { Tap } from '../v2/Tap';
import { Sheet } from '../v2/Sheet';
import { t } from '../../i18n';
import { formatDate, formatTime } from '../../i18n/format';
import { logger } from '../../lib/logger';
import { REMINDER_CHANNEL_ID } from '../../lib/notificationChannels';
import { REVISION_REMINDER_PREFIX } from '../../lib/reminders/plan';

export interface PendingReminder {
  id: string;
  at: Date;
  title: string;
  body: string;
  /** The one reminder of a day after tomorrow (REMIND-2). */
  away: boolean;
}

/** A scheduled request's time: expo-notifications lists a date trigger as `value` (ms); it is scheduled with `date`. */
function timeOf(trigger: unknown): Date | null {
  const tr = (trigger ?? {}) as { value?: unknown; date?: unknown };
  const raw = tr.value ?? tr.date;
  if (raw instanceof Date) return raw;
  if (typeof raw === 'number' && Number.isFinite(raw)) return new Date(raw);
  return null;
}

/** The revision reminders this phone has pending, soonest first. */
export async function pendingRevisionReminders(): Promise<PendingReminder[]> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  return all
    .filter((n) => n.identifier.startsWith(REVISION_REMINDER_PREFIX))
    .map((n) => ({
      id: n.identifier,
      at: timeOf(n.trigger),
      title: n.content.title ?? '',
      body: n.content.body ?? '',
      away: n.identifier.endsWith('-away'),
    }))
    .filter((n): n is PendingReminder => n.at != null)
    .sort((a, b) => a.at.getTime() - b.at.getTime());
}

const PREVIEW_ID = 'reminder-preview';

/**
 * Settings → Testing, Revisely Dev only: the revision reminders this phone will show, and when, so the days after
 * tomorrow (REMIND-2) can be seen without waiting for them. "Show the next one in 5 seconds" shows a copy of the next
 * as a real notification (its own identifier: the plan never touches it).
 */
export function ScheduledRemindersRow({ read = pendingRevisionReminders }: { read?: () => Promise<PendingReminder[]> }) {
  const { palette } = useTheme();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<PendingReminder[] | null>(null);

  const show = useCallback(() => {
    setOpen(true);
    setList(null);
    read()
      .then(setList)
      .catch((err) => {
        logger.warn('Could not read the scheduled reminders', err);
        setList([]);
      });
  }, [read]);

  const previewNext = useCallback(() => {
    const next = list?.[0];
    if (!next) return;
    Notifications.scheduleNotificationAsync({
      identifier: PREVIEW_ID,
      content: { title: next.title, body: next.body, sound: true, data: { kind: 'reminder-preview' } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5, channelId: REMINDER_CHANNEL_ID },
    }).catch((err) => logger.warn('Could not show a reminder preview', err));
    setOpen(false);
  }, [list]);

  const label = t('settings.testing.reminders');
  const subtitle = t('settings.testing.remindersSub');
  return (
    <>
      <Tap onPress={show} accessibilityRole="button" accessibilityLabel={`${label}, ${subtitle}`} testID="settings-scheduled-reminders">
        <View style={styles.row}>
          <Ionicons name="alarm-outline" size={24} color={palette.text} />
          <View style={styles.text}>
            <Text style={[typeV2.body, { color: palette.text }]}>{label}</Text>
            <Text style={[typeV2.meta, { color: palette.secondary }]}>{subtitle}</Text>
          </View>
        </View>
      </Tap>
      <Sheet
        visible={open}
        onClose={() => setOpen(false)}
        title={label}
        scroll
        footer={list && list.length > 0 ? { label: t('settings.testing.remindersPreview'), onPress: previewNext, testID: 'scheduled-reminders-preview' } : undefined}
        testID="scheduled-reminders-sheet"
      >
        {list == null ? null : list.length === 0 ? (
          <Text style={[typeV2.body, styles.item, { color: palette.secondary }]} testID="scheduled-reminders-none">
            {t('settings.testing.remindersNone')}
          </Text>
        ) : (
          list.map((r) => (
            <View key={r.id} style={[styles.item, { borderBottomColor: palette.separator }]} testID={`scheduled-reminder-${r.id}`}>
              <Text style={[typeV2.meta, { color: palette.secondary }]}>
                {t('settings.testing.remindersWhen', {
                  day: formatDate(r.at, { weekday: 'short', month: 'short', day: 'numeric' }),
                  time: formatTime(r.at),
                })}
                {r.away ? t('settings.testing.remindersAway') : ''}
              </Text>
              <Text style={[typeV2.body, styles.title, { color: palette.text }]}>{r.title}</Text>
              <Text style={[typeV2.body, { color: palette.text }]}>{r.body}</Text>
            </View>
          ))
        )}
      </Sheet>
    </>
  );
}

// The Settings rows' metrics (16pt gutter, a 24pt glyph, 16pt to the label), as AppInfo's.
const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    minHeight: 52,
    paddingVertical: 12,
    paddingHorizontal: layoutV2.gutter,
  },
  text: { flex: 1 },
  item: {
    paddingVertical: 12,
    paddingHorizontal: layoutV2.gutter,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontWeight: '600', marginTop: 2 },
});
