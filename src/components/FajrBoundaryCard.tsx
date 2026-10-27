import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { SettingIcon } from './settings/SettingIcon';
import { SettingSwitch } from './settings/SettingSwitch';
import { typeV2 } from '../theme/v2';
import { ActionSheet } from './v2/ActionSheet';
import { Tap } from './v2/Tap';
import { useTheme } from '../context/ThemeContext';
import { useApp } from '../context/AppContext';
import {
  FAJR_CALCULATION_METHODS,
  getFajrTimeFor,
  DEFAULT_FAJR_METHOD,
} from '../lib/fajrBoundary';

/**
 * Settings card for the fajr-based day boundary. Wires the location prompt,
 * persists coords + chosen calculation method, and surfaces today's fajr
 * time so the user can see the boundary they just configured.
 */
export function FajrBoundaryCard() {
  const { palette } = useTheme();
  const { user, saveUser } = useApp();
  const [busy, setBusy] = useState(false);
  const [methodOpen, setMethodOpen] = useState(false);

  const todaysFajr = useMemo(() => {
    if (!user || !user.fajrBoundaryEnabled || !user.locationCoords) return null;
    return getFajrTimeFor(new Date(), user);
  }, [user]);

  const resetsAt = todaysFajr
    ? todaysFajr.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : 'midnight';

  if (!user) return null;

  const enabled = user.fajrBoundaryEnabled;
  const hasCoords = !!user.locationCoords;
  const currentMethodLabel =
    FAJR_CALCULATION_METHODS.find(
      (m) => m.id === (user.fajrCalculationMethod || DEFAULT_FAJR_METHOD),
    )?.label ?? 'ISNA (North America)';

  const requestLocation = async (): Promise<{ latitude: number; longitude: number } | null> => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Location needed',
        'Fajr times depend on where you are. You can enable location later from Settings.',
      );
      return null;
    }
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
    } catch (e) {
      Alert.alert('Couldn\'t get your location', e instanceof Error ? e.message : 'Try again later.');
      return null;
    }
  };

  const handleToggle = async (value: boolean) => {
    setBusy(true);
    try {
      if (value) {
        let coords = user.locationCoords;
        if (!coords) coords = await requestLocation();
        if (!coords) {
          return;
        }
        await saveUser({
          ...user,
          fajrBoundaryEnabled: true,
          locationCoords: coords,
          fajrCalculationMethod: user.fajrCalculationMethod || DEFAULT_FAJR_METHOD,
        });
      } else {
        await saveUser({ ...user, fajrBoundaryEnabled: false });
      }
    } finally {
      setBusy(false);
    }
  };

  const handleRefreshLocation = async () => {
    setBusy(true);
    try {
      const coords = await requestLocation();
      if (coords) {
        await saveUser({ ...user, locationCoords: coords });
      }
    } finally {
      setBusy(false);
    }
  };

  const handlePickMethod = async (id: string) => {
    setMethodOpen(false);
    await saveUser({ ...user, fajrCalculationMethod: id });
  };

  const method = user.fajrCalculationMethod || DEFAULT_FAJR_METHOD;

  // Settings rows: the glyph, the label (and what it does now under it), the
  // control; no dividers inside the group.
  return (
    <View testID="fajr-boundary-v2">
      <View style={v2.row}>
        <SettingIcon name="moon-outline" />
        <View style={v2.text}>
          <Text style={[typeV2.body, { color: palette.text }]}>Start day at fajr</Text>
          <Text style={[typeV2.meta, { color: palette.secondary }]} testID="fajr-resets-at">
            Resets at {resetsAt}
          </Text>
        </View>
        <SettingSwitch value={enabled} onValueChange={handleToggle} disabled={busy} accessibilityLabel="Start day at fajr" />
      </View>
      {enabled && (
        <Tap
          onPress={() => setMethodOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Method, ${currentMethodLabel}`}
          testID="fajr-method"
        >
          <View style={v2.row}>
            <SettingIcon name="calculator-outline" />
            <Text style={[typeV2.body, v2.label, { color: palette.text }]}>Method</Text>
            <Text style={[typeV2.body, v2.value, { color: palette.secondary }]} numberOfLines={1}>
              {currentMethodLabel}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={palette.secondary} />
          </View>
        </Tap>
      )}
      <ActionSheet
        visible={methodOpen}
        onClose={() => setMethodOpen(false)}
        title="Calculation method"
        actions={[
          ...FAJR_CALCULATION_METHODS.map((m) => ({
            key: m.id,
            label: m.label,
            selected: method === m.id,
            onPress: () => handlePickMethod(m.id),
          })),
          {
            key: 'location',
            label: hasCoords ? 'Update location' : 'Set location',
            icon: 'location-outline' as const,
            section: 'Location',
            onPress: handleRefreshLocation,
          },
        ]}
        testID="fajr-method-sheet"
      />
    </View>
  );
}

// Settings' rows. SettingIcon brings 8pt after its glyph; 8 more makes the 16
// of the other rows.
const v2 = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingVertical: 12, paddingHorizontal: 16, gap: 8 },
  text: { flex: 1, marginRight: 8 },
  label: { flex: 1 },
  value: { flexShrink: 1, maxWidth: '55%', textAlign: 'right', marginRight: 8 },
});
