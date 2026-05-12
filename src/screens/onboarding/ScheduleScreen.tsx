import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView } from 'react-native';
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
import { radius } from '../../theme/radius';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { RevisionMode } from '../../types';
import { scheduleDailyReminder } from '../../lib/notifications';

type NavigationProp = NativeStackNavigationProp<OnboardingStackParamList, 'Schedule'>;
type RouteProps = RouteProp<OnboardingStackParamList, 'Schedule'>;

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const MODES: Array<{ value: RevisionMode; title: string; description: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { value: 'weighted', title: 'Weighted', description: 'Focus on the pages that need review most', icon: 'flash-outline' },
  { value: 'sequential', title: 'Sequential', description: 'Revise in order, page by page', icon: 'list-outline' },
];

export default function ScheduleScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { journeyStage, currentJuz, currentPage } = route.params;
  const { createDefaultUser, saveUser, completeOnboarding } = useApp();
  const { firebaseUser } = useAuth();

  const defaultCapacity = journeyStage === 'beginning' ? 10 : journeyStage === 'complete' ? 30 : 20;
  const defaultMode: RevisionMode = journeyStage === 'beginning' ? 'sequential' : 'weighted';

  const [dailyCapacity, setDailyCapacity] = useState(defaultCapacity);
  const [activeDays, setActiveDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [mode, setMode] = useState<RevisionMode>(defaultMode);
  const [lastTickValue, setLastTickValue] = useState(defaultCapacity);

  const toggleDay = (dayIndex: number) => {
    Haptics.selectionAsync();
    setActiveDays(
      activeDays.includes(dayIndex)
        ? activeDays.filter((d) => d !== dayIndex)
        : [...activeDays, dayIndex].sort(),
    );
  };

  const handleSliderChange = (v: number) => {
    if (Math.floor(v) !== Math.floor(lastTickValue)) {
      Haptics.selectionAsync();
      setLastTickValue(v);
    }
    setDailyCapacity(Math.round(v));
  };

  const handleStart = async () => {
    const user = createDefaultUser({
      name: firebaseUser?.displayName || undefined,
      dailyPageCapacity: dailyCapacity,
      activeDays,
      mode,
      currentMemorizationJuz: currentJuz ?? null,
      currentMemorizationPage: currentPage ?? null,
    });
    await saveUser(user);
    await scheduleDailyReminder(user.reminderTime, user.notificationsEnabled);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await completeOnboarding();
  };

  const headlineText =
    journeyStage === 'beginning'
      ? 'Set your starting rhythm'
      : journeyStage === 'complete'
      ? 'Set your maintenance schedule'
      : 'Set your rhythm';

  const capacityHint =
    dailyCapacity <= 10 ? 'Light' : dailyCapacity <= 20 ? '~1 juz' : dailyCapacity <= 40 ? '~2 juz' : 'Intensive';

  const totalSteps = journeyStage === 'complete' ? 3 : 4;
  const currentStep = journeyStage === 'complete' ? 2 : 3;

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
          <Stepper total={totalSteps} current={currentStep} />
        </View>

        <View style={styles.headerSection}>
          <Text style={styles.headline}>{headlineText}</Text>
          {journeyStage === 'beginning' && (
            <Text style={styles.subtext}>Start with a manageable pace. You can always adjust later.</Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pages per day</Text>
          <View style={styles.capacityDisplay}>
            <Text style={styles.capacityNumber}>{dailyCapacity}</Text>
            <Text style={styles.capacityLabel}>pages · {capacityHint.toLowerCase()}</Text>
          </View>
          <Slider
            style={styles.slider}
            minimumValue={5}
            maximumValue={60}
            step={1}
            value={dailyCapacity}
            onValueChange={handleSliderChange}
            minimumTrackTintColor={theme.accent}
            maximumTrackTintColor={theme.border}
            thumbTintColor={theme.accent}
          />
          <View style={styles.sliderLabels}>
            <Text style={styles.sliderLabel}>5</Text>
            <Text style={styles.sliderLabel}>60</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Active days</Text>
          <View style={styles.daysRow}>
            {DAYS.map((day, index) => {
              const isActive = activeDays.includes(index);
              return (
                <PressableScale
                  key={index}
                  onPress={() => toggleDay(index)}
                  haptic="none"
                  style={[styles.dayButton, isActive && styles.dayButtonActive]}
                >
                  <Text style={[styles.dayButtonText, isActive && styles.dayButtonTextActive]}>
                    {day}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Revision mode</Text>
          <View style={styles.modeCards}>
            {MODES.map((m) => {
              const isSelected = mode === m.value;
              return (
                <PressableScale
                  key={m.value}
                  onPress={() => setMode(m.value)}
                  haptic="selection"
                  style={[styles.modeCard, isSelected && styles.modeCardSelected]}
                >
                  <View
                    style={[
                      styles.modeIcon,
                      isSelected && { backgroundColor: theme.accent },
                    ]}
                  >
                    <Ionicons
                      name={m.icon}
                      size={18}
                      color={isSelected ? theme.textInverse : theme.accent}
                    />
                  </View>
                  <View style={styles.modeText}>
                    <Text style={styles.modeCardTitle}>{m.title}</Text>
                    <Text style={styles.modeCardDescription}>{m.description}</Text>
                  </View>
                  {isSelected && <Ionicons name="checkmark-circle" size={20} color={theme.accent} />}
                </PressableScale>
              );
            })}
          </View>
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
    container: { flex: 1, backgroundColor: theme.bg },
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
    capacityDisplay: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'center',
      gap: spacing.xs,
      marginBottom: spacing.sm,
    },
    capacityNumber: {
      ...typography.displayLarge,
      color: theme.accent,
    },
    capacityLabel: { ...typography.bodyLarge, color: theme.textSecondary },
    slider: { width: '100%', height: 40 },
    sliderLabels: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.xs,
    },
    sliderLabel: { ...typography.bodySmall, color: theme.textMuted },
    daysRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: spacing.xs,
    },
    dayButton: {
      flex: 1,
      aspectRatio: 1,
      backgroundColor: theme.bgAlt,
      borderRadius: radius.full,
      justifyContent: 'center',
      alignItems: 'center',
      maxHeight: 48,
    },
    dayButtonActive: {
      backgroundColor: theme.accent,
    },
    dayButtonText: {
      ...typography.titleSmall,
      color: theme.textSecondary,
    },
    dayButtonTextActive: {
      color: theme.textInverse,
    },
    modeCards: { gap: spacing.sm },
    modeCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: theme.bgAlt,
      borderWidth: 1.5,
      borderColor: 'transparent',
      borderRadius: radius.md,
      padding: spacing.md,
    },
    modeCardSelected: {
      backgroundColor: theme.accentSoft,
      borderColor: theme.accent,
    },
    modeIcon: {
      width: 36,
      height: 36,
      borderRadius: radius.full,
      backgroundColor: theme.bg,
      justifyContent: 'center',
      alignItems: 'center',
    },
    modeText: { flex: 1 },
    modeCardTitle: {
      ...typography.titleMedium,
      color: theme.textPrimary,
      marginBottom: 2,
    },
    modeCardDescription: {
      ...typography.bodySmall,
      color: theme.textSecondary,
    },
    bottomSection: { width: '100%', marginTop: spacing.md },
    button: { width: '100%' },
  });
