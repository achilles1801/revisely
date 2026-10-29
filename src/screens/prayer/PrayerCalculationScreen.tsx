import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import { useApp } from '../../context/AppContext';
import { TopBar } from '../../components/v2/TopBar';
import { PillTabs } from '../../components/v2/PillTabs';
import { ActionSheet } from '../../components/v2/ActionSheet';
import { Tap } from '../../components/v2/Tap';
import { GroupedRow, GroupedSection } from '../../components/plan/Grouped';
import { InlineStepper } from '../../components/plan/InlineStepper';
import { layoutV2, typeV2 } from '../../theme/v2';
import {
  ADJUST_LIMIT,
  AsrMadhab,
  HighLatitude,
  PRAYERS,
  setPrayerPrefs,
  usePrayerPrefs,
} from '../../lib/prayer/prefs';
import {
  CALCULATION_METHODS,
  dayTimes,
  formatTime,
  HIGH_LATITUDE_OPTIONS,
  methodLabel,
  TIME_LABELS,
} from '../../lib/prayer/times';
import { usePrayerTimes } from '../../components/prayer/usePrayerTimes';
import { usePrayerLocation } from '../../components/prayer/usePrayerLocation';

export const adjustLabel = (v: number) => (v === 0 ? '0 min' : `${v > 0 ? '+' : '−'}${Math.abs(v)} min`);

/**
 * Settings → Prayer → Calculation: where times are worked out for, the method
 * (the account's, shared with "Start day at fajr"), the high-latitude rule,
 * Asr (Standard or Hanafi) and ± minutes per prayer. All but the method are
 * kept on this phone.
 */
export default function PrayerCalculationScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const { user, saveUser } = useApp();
  const prefs = usePrayerPrefs();
  const times = usePrayerTimes(user);
  const location = usePrayerLocation(false, times.place != null);
  const [picker, setPicker] = useState<null | 'method' | 'high'>(null);
  const method = times.settings.method;

  const hanafiAsr =
    times.place && times.today
      ? dayTimes(times.place, times.now, { ...times.settings, madhab: 'hanafi' }).asr
      : null;
  const highLabel = HIGH_LATITUDE_OPTIONS.find((o) => o.id === prefs.highLatitude)?.label ?? 'Recommended';

  return (
    <View style={[styles.container, { backgroundColor: palette.bg }]} testID="prayer-calculation-screen">
      <View style={{ paddingTop: insets.top }}>
        <TopBar title="Calculation" onBack={() => navigation.goBack()} separator />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        <GroupedSection header="Location">
          <GroupedRow
            icon="location-outline"
            title={times.placeLabel ?? (times.place ? 'Your location' : 'Not set')}
            subtitle="On this phone only"
            trailing={
              <Tap onPress={location.allow} hitSlop={8} accessibilityRole="button" testID="prayer-location-update">
                <Text style={[typeV2.body, { color: palette.link }]}>Update</Text>
              </Tap>
            }
          />
        </GroupedSection>

        <GroupedSection header="Method" footer="Also used for “Start day at fajr”.">
          <GroupedRow
            icon="calculator-outline"
            title="Method"
            value={methodLabel(method)}
            accessory="chevron"
            onPress={() => setPicker('method')}
            testID="prayer-method"
          />
          <GroupedRow
            icon="globe-outline"
            title="High latitudes"
            value={highLabel}
            accessory="chevron"
            onPress={() => setPicker('high')}
            testID="prayer-high-latitude"
          />
        </GroupedSection>

        <GroupedSection
          header="Asr time"
          footer={`Standard is Shafiʿi, Mālikī and Ḥanbalī. Hanafi puts Asr later${hanafiAsr ? ` (${formatTime(hanafiAsr)} today)` : ''}.`}
        >
          <View style={styles.tabs}>
            <PillTabs<AsrMadhab>
              options={[
                { value: 'standard', label: 'Standard' },
                { value: 'hanafi', label: 'Hanafi' },
              ]}
              value={prefs.madhab}
              onChange={(madhab) => setPrayerPrefs({ madhab })}
              testID="prayer-madhab"
            />
          </View>
        </GroupedSection>

        <GroupedSection header="Adjustments" footer="Minutes added to or taken from each time, to match your mosque.">
          {PRAYERS.map((p) => (
            <GroupedRow
              key={p}
              title={TIME_LABELS[p].en}
              trailing={
                <InlineStepper
                  value={prefs.adjustments[p]}
                  min={-ADJUST_LIMIT}
                  max={ADJUST_LIMIT}
                  onChange={(v) => setPrayerPrefs({ adjustments: { ...prefs.adjustments, [p]: v } })}
                  label={`minutes for ${TIME_LABELS[p].en}`}
                  formatValue={adjustLabel}
                />
              }
              testID={`prayer-adjust-${p}`}
            />
          ))}
        </GroupedSection>
      </ScrollView>

      <ActionSheet
        visible={picker === 'method'}
        onClose={() => setPicker(null)}
        title="Method"
        actions={CALCULATION_METHODS.map((m) => ({
          key: m.id,
          label: m.label,
          selected: m.id === method,
          onPress: () => {
            if (user && m.id !== method) saveUser({ ...user, fajrCalculationMethod: m.id }).catch(() => undefined);
            setPrayerPrefs({ methodSuggested: true });
          },
        }))}
        testID="prayer-method-menu"
      />
      <ActionSheet
        visible={picker === 'high'}
        onClose={() => setPicker(null)}
        title="High latitudes"
        message="How Fajr and Isha are found where twilight lasts all night in summer."
        actions={HIGH_LATITUDE_OPTIONS.map((o) => ({
          key: o.id,
          label: o.label,
          subtitle: o.detail,
          selected: o.id === prefs.highLatitude,
          onPress: () => setPrayerPrefs({ highLatitude: o.id as HighLatitude }),
        }))}
        testID="prayer-high-latitude-menu"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabs: { paddingHorizontal: layoutV2.gutter, paddingVertical: 6 },
});
