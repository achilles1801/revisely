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

/** "Standard tone · 10 min before", "Athan", "Silent". */
export function alertSummary(a: PrayerAlert): string {
  const sound = a.sound === 'silent' ? 'Silent' : a.sound === 'athan' ? 'Athan' : 'Standard tone';
  return a.before > 0 ? `${sound} · ${a.before} min before` : sound;
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
        <TopBar title="Prayer notifications" onBack={() => navigation.goBack()} separator />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        <GroupedSection
          header="Prayers"
          footer={
            anyOn && days > 0
              ? `Scheduled on this phone for the next ${days} ${days === 1 ? 'day' : 'days'}. Opening Revisely keeps them going.`
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
                      accessibilityLabel={`${TIME_LABELS[p].en}: ${alertSummary(a)}. Change`}
                      testID={`prayer-alert-${p}-detail`}
                    >
                      <Text style={[typeV2.meta, { color: palette.accentText }]} maxFontSizeMultiplier={1.4}>
                        {alertSummary(a)}
                      </Text>
                      <Ionicons name="chevron-forward" size={12} color={palette.accentText} />
                    </Tap>
                  ) : (
                    <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={1.4}>
                      Off
                    </Text>
                  )}
                </View>
                <SettingSwitch value={a.on} onValueChange={(v) => toggle(p, v)} testID={`prayer-alert-${p}-switch`} />
              </View>
            );
          })}
        </GroupedSection>
      </ScrollView>

      <AlertSheet prayer={editing} onClose={() => setEditing(null)} />
      {permission.sheets}
    </View>
  );
}

/** One prayer's reminder and sound. */
function AlertSheet({ prayer, onClose }: { prayer: PrayerName | null; onClose: () => void }) {
  const { palette } = useTheme();
  const prefs = usePrayerPrefs();
  const [shown, setShown] = useState<PrayerName>('fajr');
  if (prayer && prayer !== shown) setShown(prayer);
  const a = prefs.alerts[shown];
  return (
    <Sheet
      visible={prayer != null}
      onClose={onClose}
      title={TIME_LABELS[shown].en}
      footer={{ label: 'Done', onPress: onClose, testID: 'prayer-alert-done' }}
      testID="prayer-alert-sheet"
    >
      <View style={styles.sheet}>
        <Text style={[typeV2.name, styles.sheetHeader, { color: palette.text }]} accessibilityRole="header">
          Reminder before
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
                  {m === 0 ? 'Off' : `${m} min`}
                </Text>
              </Tap>
            );
          })}
        </View>
        <Text style={[typeV2.name, styles.sheetHeader, { color: palette.text }]} accessibilityRole="header">
          Sound
        </Text>
        {(
          [
            { id: 'standard', label: 'Standard tone', detail: undefined },
            { id: 'athan', label: 'Athan', detail: 'At the prayer’s time. A reminder before it has the standard tone' },
            { id: 'silent', label: 'Silent', detail: 'A banner only' },
          ] as const
        ).map((o) => {
          const selected = a.sound === o.id;
          return (
            <Tap
              key={o.id}
              onPress={() => setPrayerAlert(shown, { sound: o.id })}
              style={styles.option}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
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
