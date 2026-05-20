import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Switch, Alert, Modal, ScrollView, Pressable, Platform } from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from './GlassCard';
import { PressableScale } from './PressableScale';
import { useTheme } from '../context/ThemeContext';
import { ThemeColors } from '../theme/colors';
import { typography } from '../theme/typography';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
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
  const { theme } = useTheme();
  const styles = makeStyles(theme);
  const { user, saveUser } = useApp();
  const [busy, setBusy] = useState(false);
  const [methodOpen, setMethodOpen] = useState(false);

  const todaysFajr = useMemo(() => {
    if (!user || !user.fajrBoundaryEnabled || !user.locationCoords) return null;
    return getFajrTimeFor(new Date(), user);
  }, [user]);

  // When the boundary is off (or location missing), the day rolls at local
  // midnight. We compute and show the time either way so the user always
  // knows when their session resets.
  const boundaryDisplay = useMemo(() => {
    if (todaysFajr) {
      return {
        label: 'Your day rolls over at',
        value: `${todaysFajr.toLocaleTimeString([], {
          hour: 'numeric',
          minute: '2-digit',
        })} (fajr)`,
      };
    }
    return {
      label: 'Your day rolls over at',
      value: 'midnight',
    };
  }, [todaysFajr]);

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

  return (
    <View style={styles.container}>
      <GlassCard style={StyleSheet.absoluteFillObject} />
      <View style={styles.headerRow}>
        <View style={[styles.iconBubble, { backgroundColor: theme.accent + '20' }]}>
          <Ionicons name="moon-outline" size={18} color={theme.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[typography.bodyMedium, { color: theme.textPrimary, fontWeight: '600' }]}>
            Roll over at fajr
          </Text>
          <Text style={[typography.bodySmall, { color: theme.textSecondary }]}>
            On: late-night revising counts as today. Off: day ends at midnight.
          </Text>
        </View>
        <Switch
          value={enabled}
          onValueChange={handleToggle}
          disabled={busy}
          trackColor={{ false: theme.border, true: theme.accent }}
          thumbColor={Platform.OS === 'android' ? theme.bg : undefined}
        />
      </View>

      <View style={styles.details}>
        <View style={styles.detailRow}>
          <Text style={[typography.label, { color: theme.textMuted }]}>
            {boundaryDisplay.label}
          </Text>
          <Text style={[typography.bodyMedium, { color: theme.textPrimary, fontWeight: '600' }]}>
            {boundaryDisplay.value}
          </Text>
        </View>

        {enabled && (
          <>
            <PressableScale onPress={() => setMethodOpen(true)} haptic="light">
              <View style={styles.detailRow}>
                <Text style={[typography.label, { color: theme.textMuted }]}>Calculation</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={[typography.bodyMedium, { color: theme.textSecondary }]}>
                    {currentMethodLabel}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
                </View>
              </View>
            </PressableScale>

            <PressableScale onPress={handleRefreshLocation} haptic="light">
              <View style={styles.detailRow}>
                <Text style={[typography.label, { color: theme.textMuted }]}>Location</Text>
                <Text style={[typography.bodyMedium, { color: theme.textSecondary }]}>
                  {hasCoords ? 'Update location' : 'Set location'}
                </Text>
              </View>
            </PressableScale>
          </>
        )}
      </View>

      <Modal visible={methodOpen} transparent animationType="fade" onRequestClose={() => setMethodOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setMethodOpen(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <GlassCard style={StyleSheet.absoluteFillObject} />
            <Text style={[typography.titleMedium, { color: theme.textPrimary, marginBottom: spacing.sm }]}>
              Calculation method
            </Text>
            <ScrollView>
              {FAJR_CALCULATION_METHODS.map((m) => {
                const selected =
                  (user.fajrCalculationMethod || DEFAULT_FAJR_METHOD) === m.id;
                return (
                  <PressableScale key={m.id} onPress={() => handlePickMethod(m.id)} haptic="selection">
                    <View
                      style={[
                        styles.methodRow,
                        { borderBottomColor: theme.border },
                        selected && { backgroundColor: theme.accent + '15' },
                      ]}
                    >
                      <Text style={[typography.bodyMedium, { color: theme.textPrimary }]}>
                        {m.label}
                      </Text>
                      {selected && <Ionicons name="checkmark" size={18} color={theme.accent} />}
                    </View>
                  </PressableScale>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    container: {
      borderRadius: radius.md,
      padding: spacing.md,
      overflow: 'hidden',
      gap: spacing.sm,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    iconBubble: {
      width: 32,
      height: 32,
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    details: {
      gap: spacing.xs,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.border,
      paddingTop: spacing.sm,
    },
    detailRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: spacing.xxs,
    },
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.lg,
    },
    modalCard: {
      width: '100%',
      maxHeight: '70%',
      borderRadius: radius.md,
      padding: spacing.md,
      overflow: 'hidden',
    },
    methodRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.xs,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
  });
