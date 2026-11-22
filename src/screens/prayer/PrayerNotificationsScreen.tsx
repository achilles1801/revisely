import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useApp } from '../../context/AppContext';
import { TopBar } from '../../components/v2/TopBar';
import { Sheet } from '../../components/v2/Sheet';
import { Tap } from '../../components/v2/Tap';
import { GroupedSection } from '../../components/plan/Grouped';
import { SettingSwitch } from '../../components/settings/SettingSwitch';
import { layoutV2, typeV2 } from '../../theme/v2';
import {
  PrayerAlert,
  PrayerName,
  PRAYERS,
  REMINDER_OPTIONS,
  setPrayerAlert,
  usePrayerPrefs,
} from '../../lib/prayer/prefs';
import { formatTime, TIME_LABELS } from '../../lib/prayer/times';
import { usePrayerTimes } from '../../components/prayer/usePrayerTimes';
import { usePrayerNotifyPermission } from '../../components/prayer/usePrayerNotifyPermission';
import { useScheduledPrayerDays } from '../../lib/prayer/status';
import { previewPrayerSound } from '../../lib/prayer/soundPreview';
import { athanEnabled } from '../../lib/athan';
import { useChosenAthanVoice } from '../../components/prayer/useChosenAthanVoice';
import { t } from '../../i18n';
import { forwardIcon } from '../../i18n/direction';

/** "Standard tone · 10 min before", "Athan", "Silent". Where the athan isn't offered, it reads as the standard tone. */
export function alertSummary(a: PrayerAlert): string {
  const sound =
    a.sound === 'silent'
      ? t('prayer.notifications.silent')
      : a.sound === 'athan' && athanEnabled()
        ? t('prayer.notifications.athan')
        : t('prayer.standardTone');
  return a.before > 0 ? t('prayer.notifications.summaryBefore', { sound, minutes: a.before }) : sound;
}

/**
 * Settings → Prayer → Prayer notifications: each prayer on or off, with its
 * reminder and sound (a sheet). Turning the first one on asks for permission
 * (an in-app line first). Scheduled on the phone (PrayerSync).
 */
export default function PrayerNotificationsScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const { user } = useApp();
  const prefs = usePrayerPrefs();
  const times = usePrayerTimes(user);
  const permission = usePrayerNotifyPermission();
  const days = useScheduledPrayerDays();
  const [editing, setEditing] = useState<PrayerName | null>(null);
  const anyOn = PRAYERS.some((p) => prefs.alerts[p].on);

  const toggle = (p: PrayerName, on: boolean) => {
    if (!on) setPrayerAlert(p, { on: false });
    else permission.ensure(() => setPrayerAlert(p, { on: true }));
  };

  return (
    <View style={[styles.container, { backgroundColor: palette.bg }]} testID="prayer-notifications-screen">
      <View style={{ paddingTop: insets.top }}>
        <TopBar title={t('prayer.notifications.title')} onBack={() => navigation.goBack()} separator />
      </View>
      <ScrollView contentInsetAdjustmentBehavior="never" contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        <GroupedSection
          header={t('prayer.notifications.prayers')}
          footer={
            anyOn && days > 0
              ? t('prayer.notifications.scheduled', { count: days })
              : undefined
          }
        >
          {PRAYERS.map((p) => {
            const a = prefs.alerts[p];
            const at = times.today?.[p];
            return (
              <View key={p} style={styles.row} testID={`prayer-alert-${p}`}>
                <View style={styles.rowText}>
                  <Text style={[typeV2.body, styles.name, { color: palette.text }]} maxFontSizeMultiplier={1.4}>
                    {TIME_LABELS[p].en}
                    {at ? (
                      <Text style={[typeV2.numeral, styles.time, { color: palette.secondary }]}>  {formatTime(at)}</Text>
                    ) : null}
                  </Text>
                  {a.on ? (
                    <Tap
                      onPress={() => setEditing(p)}
                      hitSlop={6}
                      style={styles.detail}
                      accessibilityRole="button"
                      accessibilityLabel={t('prayer.notifications.rowLabel', { name: TIME_LABELS[p].en, summary: alertSummary(a) })}
                      testID={`prayer-alert-${p}-detail`}
                    >
                      <Text style={[typeV2.meta, { color: palette.accentText }]} maxFontSizeMultiplier={1.4}>
                        {alertSummary(a)}
                      </Text>
                      <Ionicons name={forwardIcon()} size={12} color={palette.accentText} />
                    </Tap>
                  ) : (
                    <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={1.4}>
                      {t('prayer.notifications.off')}
                    </Text>
                  )}
                </View>
                <SettingSwitch value={a.on} onValueChange={(v) => toggle(p, v)} testID={`prayer-alert-${p}-switch`} />
              </View>
            );
          })}
        </GroupedSection>
      </ScrollView>

      <AlertSheet
        prayer={editing}
        onClose={() => setEditing(null)}
        onVoice={(p) => {
          setEditing(null);
          (navigation as { navigate: (name: string, params?: object) => void }).navigate('AthanVoice', { prayer: p });
        }}
      />
      {permission.sheets}
    </View>
  );
}

/** One prayer's reminder and sound. */
function AlertSheet({
  prayer,
  onClose,
  onVoice,
}: {
  prayer: PrayerName | null;
  onClose: () => void;
  /** Opens the voice picker for this prayer. */
  onVoice: (prayer: PrayerName) => void;
}) {
  const { palette } = useTheme();
  const prefs = usePrayerPrefs();
  const [shown, setShown] = useState<PrayerName>('fajr');
  if (prayer && prayer !== shown) setShown(prayer);
  const a = prefs.alerts[shown];
  const athan = athanEnabled();
  const voice = useChosenAthanVoice(shown);
  const options: { id: 'standard' | 'athan' | 'silent'; label: string; detail?: string }[] = [
    { id: 'standard', label: t('prayer.standardTone') },
    ...(athan ? [{ id: 'athan' as const, label: t('prayer.notifications.athan'), detail: t('prayer.notifications.athanDetail') }] : []),
    { id: 'silent', label: t('prayer.notifications.silent'), detail: t('prayer.notifications.silentDetail') },
  ];
  // Where the athan isn't offered, a prayer saved with it shows (and plays) the standard tone.
  const current = a.sound === 'athan' && !athan ? 'standard' : a.sound;
  return (
    <Sheet
      visible={prayer != null}
      onClose={onClose}
      title={TIME_LABELS[shown].en}
      footer={{ label: t('common.done'), onPress: onClose, testID: 'prayer-alert-done' }}
      testID="prayer-alert-sheet"
    >
      <View style={styles.sheet}>
        <Text style={[typeV2.name, styles.sheetHeader, { color: palette.text }]} accessibilityRole="header">
          {t('prayer.notifications.reminderBefore')}
        </Text>
        <View style={styles.chips}>
          {REMINDER_OPTIONS.map((m) => {
            const selected = a.before === m;
            return (
              <Tap
                key={m}
                onPress={() => setPrayerAlert(shown, { before: m })}
                style={[
                  styles.chip,
                  selected
                    ? { backgroundColor: palette.primary, borderColor: palette.primary }
                    : { borderColor: palette.outline },
                ]}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                testID={`prayer-before-${m}`}
              >
                <Text style={[typeV2.button, { color: selected ? palette.onPrimary : palette.text }]} maxFontSizeMultiplier={1.3}>
                  {m === 0 ? t('prayer.notifications.off') : t('prayer.notifications.minutes', { minutes: m })}
                </Text>
              </Tap>
            );
          })}
        </View>
        <Text style={[typeV2.name, styles.sheetHeader, { color: palette.text }]} accessibilityRole="header">
          {t('prayer.notifications.sound')}
        </Text>
        {options.map((o) => {
          const selected = current === o.id;
          return (
            <Tap
              key={o.id}
              // Picks it and plays it, as iOS's own sound settings do (again on
              // each tap). Silent plays nothing.
              onPress={() => {
                setPrayerAlert(shown, { sound: o.id });
                // The athan is listened to in its voice picker; the others play here.
                if (o.id !== 'athan') void previewPrayerSound(o.id);
              }}
              style={styles.option}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityHint={o.id === 'standard' ? t('prayer.notifications.playsSound') : undefined}
              testID={`prayer-sound-${o.id}`}
            >
              <View style={styles.rowText}>
                <Text style={[typeV2.menu, { color: palette.text }]}>{o.label}</Text>
                {o.detail ? <Text style={[typeV2.meta, { color: palette.secondary }]}>{o.detail}</Text> : null}
              </View>
              {selected ? <Ionicons name="checkmark" size={22} color={palette.accentText} /> : null}
            </Tap>
          );
        })}
        {current === 'athan' ? (
          <Tap
            onPress={() => onVoice(shown)}
            style={styles.option}
            accessibilityRole="button"
            accessibilityLabel={`${t('prayer.notifications.voice')}: ${voice?.name ?? t('prayer.notifications.chooseVoice')}`}
            testID="prayer-athan-voice"
          >
            <View style={styles.rowText}>
              <Text style={[typeV2.menu, { color: palette.text }]}>{t('prayer.notifications.voice')}</Text>
              <Text style={[typeV2.meta, { color: palette.secondary }]}>{voice?.name ?? t('prayer.notifications.chooseVoice')}</Text>
            </View>
            <Ionicons name={forwardIcon()} size={18} color={palette.secondary} />
          </Tap>
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 64,
    paddingVertical: 10,
    paddingHorizontal: layoutV2.gutter,
    gap: 12,
  },
  rowText: { flex: 1, minWidth: 0 },
  name: { fontWeight: '600', fontSize: 17, lineHeight: 22 },
  time: { fontWeight: '400', fontSize: 15 },
  detail: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2, alignSelf: 'flex-start' },
  sheet: { paddingHorizontal: layoutV2.gutter, paddingBottom: 8 },
  sheetHeader: { marginTop: 12, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 36, paddingHorizontal: 16, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  option: { flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingVertical: 8 },
});
