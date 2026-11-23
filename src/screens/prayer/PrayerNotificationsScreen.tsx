import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useApp } from '../../context/AppContext';
import { TopBar } from '../../components/v2/TopBar';
import { Tap } from '../../components/v2/Tap';
import { GroupedSection } from '../../components/plan/Grouped';
import { SettingSwitch } from '../../components/settings/SettingSwitch';
import { layoutV2, typeV2 } from '../../theme/v2';
import { PrayerName, PRAYERS, setPrayerAlert, usePrayerPrefs } from '../../lib/prayer/prefs';
import { formatTime, TIME_LABELS } from '../../lib/prayer/times';
import { usePrayerTimes } from '../../components/prayer/usePrayerTimes';
import { usePrayerNotifyPermission } from '../../components/prayer/usePrayerNotifyPermission';
import { useScheduledPrayerDays } from '../../lib/prayer/status';
import { alertSummary, PrayerAlertSheet } from '../../components/prayer/PrayerAlertSheet';
import { t } from '../../i18n';
import { forwardIcon } from '../../i18n/direction';

export { alertSummary };

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

      <PrayerAlertSheet
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
});
