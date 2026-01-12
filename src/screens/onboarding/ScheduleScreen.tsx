import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity } from 'react-native';
import Slider from '@react-native-community/slider';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { OnboardingStackParamList } from '../../navigation/OnboardingNavigator';
import { Button } from '../../components/Button';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { RevisionMode } from '../../types';
import { scheduleDailyReminder } from '../../lib/notifications';

type NavigationProp = NativeStackNavigationProp<OnboardingStackParamList, 'Schedule'>;
type RouteProps = RouteProp<OnboardingStackParamList, 'Schedule'>;

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function ScheduleScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { journeyStage, currentJuz, currentPage } = route.params;
  const { createDefaultUser, saveUser, completeOnboarding } = useApp();
  const { firebaseUser } = useAuth();

  // Set defaults based on journey stage
  const getDefaultCapacity = () => {
    switch (journeyStage) {
      case 'beginning':
        return 10; // Start slow
      case 'complete':
        return 30; // More capacity for hafiz
      default:
        return 20;
    }
  };

  const getDefaultMode = (): RevisionMode => {
    switch (journeyStage) {
      case 'beginning':
        return 'sequential'; // Sequential makes more sense when starting
      case 'complete':
        return 'weighted'; // Weighted for maintenance
      default:
        return 'weighted';
    }
  };

  const [dailyCapacity, setDailyCapacity] = useState(getDefaultCapacity());
  const [activeDays, setActiveDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [mode, setMode] = useState<RevisionMode>(getDefaultMode());

  const toggleDay = (dayIndex: number) => {
    if (activeDays.includes(dayIndex)) {
      setActiveDays(activeDays.filter(d => d !== dayIndex));
    } else {
      setActiveDays([...activeDays, dayIndex].sort());
    }
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

    // Schedule daily reminder
    await scheduleDailyReminder(user.reminderTime, user.notificationsEnabled);

    await completeOnboarding();
    // Navigation will automatically switch to MainNavigator
  };

  const getHeadlineText = () => {
    switch (journeyStage) {
      case 'beginning':
        return 'Set your starting rhythm';
      case 'complete':
        return 'Set your maintenance schedule';
      default:
        return 'Set your rhythm';
    }
  };

  const getCapacityHint = () => {
    if (dailyCapacity <= 10) return 'Light';
    if (dailyCapacity <= 20) return '~1 juz';
    if (dailyCapacity <= 40) return '~2 juz';
    return 'Intensive';
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <View style={styles.topSection}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.stepIndicator}>
            {journeyStage === 'complete' ? 'Step 2 of 3' : 'Step 3 of 4'}
          </Text>
          <Text style={styles.headline}>{getHeadlineText()}</Text>
          {journeyStage === 'beginning' && (
            <Text style={styles.subtext}>
              Start with a manageable pace. You can always adjust later.
            </Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Daily capacity</Text>
          <View style={styles.capacityDisplay}>
            <Text style={styles.capacityNumber}>{dailyCapacity}</Text>
            <Text style={styles.capacityLabel}>pages</Text>
          </View>
          <Slider
            style={styles.slider}
            minimumValue={5}
            maximumValue={60}
            step={1}
            value={dailyCapacity}
            onValueChange={setDailyCapacity}
            minimumTrackTintColor={colors.accent}
            maximumTrackTintColor={colors.border}
            thumbTintColor={colors.accent}
          />
          <View style={styles.sliderLabels}>
            <Text style={styles.sliderLabel}>5</Text>
            <Text style={styles.sliderLabelCenter}>{getCapacityHint()}</Text>
            <Text style={styles.sliderLabel}>60</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Active days</Text>
          <View style={styles.daysRow}>
            {DAYS.map((day, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.dayButton,
                  activeDays.includes(index) && styles.dayButtonActive,
                ]}
                onPress={() => toggleDay(index)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.dayButtonText,
                    activeDays.includes(index) && styles.dayButtonTextActive,
                  ]}
                >
                  {day}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Revision mode</Text>
          <View style={styles.modeCards}>
            <TouchableOpacity
              style={[
                styles.modeCard,
                mode === 'weighted' && styles.modeCardSelected,
              ]}
              onPress={() => setMode('weighted')}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.modeCardTitle,
                  mode === 'weighted' && styles.modeCardTitleSelected,
                ]}
              >
                Weighted
              </Text>
              <Text
                style={[
                  styles.modeCardDescription,
                  mode === 'weighted' && styles.modeCardDescriptionSelected,
                ]}
              >
                Prioritize pages by urgency
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.modeCard,
                mode === 'sequential' && styles.modeCardSelected,
              ]}
              onPress={() => setMode('sequential')}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.modeCardTitle,
                  mode === 'sequential' && styles.modeCardTitleSelected,
                ]}
              >
                Sequential
              </Text>
              <Text
                style={[
                  styles.modeCardDescription,
                  mode === 'sequential' && styles.modeCardDescriptionSelected,
                ]}
              >
                Revise in order
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.bottomSection}>
          <Button
            title="Start"
            onPress={handleStart}
            variant="primary"
            style={styles.button}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
  },
  topSection: {
    marginBottom: spacing.xl,
  },
  backButton: {
    marginBottom: spacing.md,
  },
  backButtonText: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
  },
  stepIndicator: {
    ...typography.label,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  headline: {
    ...typography.displaySmall,
    color: colors.textPrimary,
  },
  subtext: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  capacityDisplay: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  capacityNumber: {
    ...typography.displayLarge,
    color: colors.textPrimary,
    marginRight: spacing.xs,
  },
  capacityLabel: {
    ...typography.bodyLarge,
    color: colors.textSecondary,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  sliderLabel: {
    ...typography.bodySmall,
    color: colors.textMuted,
  },
  sliderLabelCenter: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  daysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  dayButton: {
    flex: 1,
    aspectRatio: 1,
    backgroundColor: colors.bgAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayButtonActive: {
    backgroundColor: colors.bgDark,
    borderColor: colors.bgDark,
  },
  dayButtonText: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  dayButtonTextActive: {
    color: colors.textInverse,
  },
  modeCards: {
    gap: spacing.md,
  },
  modeCard: {
    backgroundColor: colors.bgAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 0,
    padding: spacing.lg,
  },
  modeCardSelected: {
    backgroundColor: colors.bgDark,
    borderColor: colors.bgDark,
  },
  modeCardTitle: {
    ...typography.displaySmall,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  modeCardTitleSelected: {
    color: colors.textInverse,
  },
  modeCardDescription: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
  },
  modeCardDescriptionSelected: {
    color: colors.textInverse,
    opacity: 0.9,
  },
  bottomSection: {
    width: '100%',
    marginTop: spacing.lg,
  },
  button: {
    width: '100%',
  },
});
