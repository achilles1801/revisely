import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, Switch, Platform } from 'react-native';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { OnboardingStackParamList } from '../../navigation/OnboardingNavigator';
import { Button } from '../../components/Button';
import { PressableScale } from '../../components/PressableScale';
import { Stepper } from '../../components/Stepper';
import { useTheme } from '../../context/ThemeContext';
import { ThemeColors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { scheduleDailyReminder } from '../../lib/notifications';

type NavigationProp = NativeStackNavigationProp<OnboardingStackParamList, 'Schedule'>;
type RouteProps = RouteProp<OnboardingStackParamList, 'Schedule'>;

export default function ScheduleScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { journeyStage } = route.params;
  const { pages, createDefaultUser, saveUser, completeOnboarding } = useApp();
  const { firebaseUser } = useAuth();

  const defaultCapacity = journeyStage === 'complete' ? 20 : 10;

  const [dailyCapacity, setDailyCapacity] = useState(defaultCapacity);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [lastCapacityTick, setLastCapacityTick] = useState(defaultCapacity);

  const memorizedCount = useMemo(
    () => pages.filter((p) => p.status === 'memorized').length,
    [pages],
  );

  // Cycle length is derived from how many pages the user has memorized and how
  // many they want to revise per day. No need to ask — they'd just be doing
  // this math in their head.
  const derivedCycleDays = useMemo(() => {
    if (memorizedCount === 0 || dailyCapacity === 0) return 0;
    return Math.ceil(memorizedCount / dailyCapacity);
  }, [memorizedCount, dailyCapacity]);

  const handleCapacityChange = (v: number) => {
    const rounded = Math.round(v);
    if (rounded !== lastCapacityTick) {
      Haptics.selectionAsync();
      setLastCapacityTick(rounded);
    }
    setDailyCapacity(rounded);
  };

  const handleStart = async () => {
    const user = createDefaultUser({
      name: firebaseUser?.displayName || undefined,
      dailyPageCapacity: dailyCapacity,
      notificationsEnabled,
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // saveUser, the daily reminder schedule, and the onboarding flag flip are
    // independent — running them in parallel collapses three sequential
    // round-trips into one so the navigation flip to Main is near-instant.
    await Promise.all([
      saveUser(user),
      scheduleDailyReminder(user.reminderTime, user.notificationsEnabled),
      completeOnboarding(),
    ]);
  };

  const headlineText =
    journeyStage === 'complete' ? 'Set your maintenance schedule' : 'Set your rhythm';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <View style={styles.topSection}>
          <PressableScale
            onPress={() => navigation.goBack()}
            haptic="light"
            style={styles.backButton}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="chevron-back" size={24} color={theme.textSecondary} />
          </PressableScale>
          <Stepper total={3} current={3} />
        </View>

        <View style={styles.headerSection}>
          <Text style={styles.headline}>{headlineText}</Text>
          <Text style={styles.subtext}>You can always adjust later.</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pages per day</Text>
          <View style={styles.bigNumberRow}>
            <Text style={styles.bigNumber}>{dailyCapacity}</Text>
            <Text style={styles.bigNumberLabel}>pages</Text>
          </View>
          <Slider
            style={styles.slider}
            minimumValue={1}
            maximumValue={60}
            step={1}
            value={dailyCapacity}
            onValueChange={handleCapacityChange}
            minimumTrackTintColor={theme.accent}
            maximumTrackTintColor={theme.border}
            thumbTintColor={theme.accent}
          />
          <View style={styles.sliderLabels}>
            <Text style={styles.sliderLabel}>1</Text>
            <Text style={styles.sliderLabel}>60</Text>
          </View>
          {derivedCycleDays > 0 && (
            <Text style={styles.helperText}>
              Full revision cycle: ~{derivedCycleDays} day{derivedCycleDays === 1 ? '' : 's'}
            </Text>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.notificationRow}>
            <View style={styles.notificationText}>
              <Text style={styles.sectionTitle}>Daily reminders</Text>
              <Text style={styles.helperText}>
                Get a nudge each day so revision stays consistent.
              </Text>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={(v) => {
                Haptics.selectionAsync();
                setNotificationsEnabled(v);
              }}
              trackColor={{ false: theme.border, true: theme.accent }}
              thumbColor={Platform.OS === 'android' ? theme.bg : undefined}
            />
          </View>
        </View>

        <View style={styles.disclosureRow}>
          <Ionicons name="time-outline" size={16} color={theme.textMuted} />
          <Text style={styles.disclosureText}>
            New sessions start each day at midnight in your local timezone.
          </Text>
        </View>

        <View style={styles.bottomSection}>
          <Button title="Start" onPress={handleStart} variant="primary" style={styles.button} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent' },
    scrollView: { flex: 1 },
    content: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.xl,
    },
    topSection: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.xl,
    },
    backButton: { padding: spacing.xxs },
    headerSection: { marginBottom: spacing.xl },
    headline: { ...typography.displaySmall, color: theme.textPrimary, marginBottom: spacing.xs },
    subtext: { ...typography.bodyMedium, color: theme.textSecondary },
    section: { marginBottom: spacing.xl },
    sectionTitle: { ...typography.label, color: theme.textMuted, marginBottom: spacing.md },
    bigNumberRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'center',
      gap: spacing.xs,
      marginBottom: spacing.sm,
    },
    bigNumber: {
      ...typography.displayLarge,
      color: theme.accent,
    },
    bigNumberLabel: { ...typography.bodyLarge, color: theme.textSecondary },
    slider: { width: '100%', height: 40 },
    sliderLabels: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.xs,
    },
    sliderLabel: { ...typography.bodySmall, color: theme.textMuted },
    helperText: {
      ...typography.bodySmall,
      color: theme.textMuted,
      marginTop: spacing.xs,
      textAlign: 'center',
    },
    notificationRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    notificationText: { flex: 1 },
    disclosureRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.sm,
      marginBottom: spacing.lg,
    },
    disclosureText: {
      ...typography.bodySmall,
      color: theme.textMuted,
      flex: 1,
    },
    bottomSection: { width: '100%', marginTop: spacing.md },
    button: { width: '100%' },
  });
