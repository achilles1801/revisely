import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { OnboardingStackParamList, JourneyStage } from '../../navigation/OnboardingNavigator';
import { Button } from '../../components/Button';
import { GlassCard } from '../../components/GlassCard';
import { PressableScale } from '../../components/PressableScale';
import { Stepper } from '../../components/Stepper';
import { useTheme } from '../../context/ThemeContext';
import { ThemeColors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';

type NavigationProp = NativeStackNavigationProp<OnboardingStackParamList, 'JourneySelect'>;

const OPTIONS: Array<{ value: JourneyStage; title: string; description: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { value: 'in_progress', title: 'In Progress', description: 'I’ve memorized part of the Quran', icon: 'flame-outline' },
  { value: 'complete', title: 'Complete', description: 'I’ve memorized the whole Quran', icon: 'star-outline' },
];

export default function JourneySelectScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [selectedStage, setSelectedStage] = useState<JourneyStage>('in_progress');

  // No pre-seeding here. JuzSelection initializes its local pendingChanges
  // buffer from the journeyStage param and only flushes to global state on
  // Continue. This screen's tap is just a navigation.
  const handleContinue = () => {
    navigation.navigate('JuzSelection', { journeyStage: selectedStage });
  };

  const totalSteps = 3;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.topSection}>
          <PressableScale
            onPress={() => navigation.goBack()}
            haptic="light"
            style={styles.backButton}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="chevron-back" size={24} color={theme.textSecondary} />
          </PressableScale>
          <Stepper total={totalSteps} current={1} />
        </View>

        <View style={styles.headerSection}>
          <Text style={styles.headline}>Where are you in your journey?</Text>
        </View>

        <View style={styles.cardsSection}>
          {OPTIONS.map((option) => {
            const isSelected = selectedStage === option.value;
            return (
              <PressableScale
                key={option.value}
                onPress={() => setSelectedStage(option.value)}
                haptic="selection"
                style={[
                  styles.cardOuter,
                  isSelected && styles.cardSelected,
                ]}
              >
                <GlassCard
                  style={StyleSheet.absoluteFillObject}
                  tintColor={
                    isSelected
                      ? theme.accent + '33' // ~20% accent tint for selected
                      : undefined
                  }
                />
                <View style={styles.cardInner}>
                  <View
                    style={[
                      styles.iconWrap,
                      isSelected && { backgroundColor: theme.accent },
                    ]}
                  >
                    <Ionicons
                      name={option.icon}
                      size={20}
                      color={isSelected ? theme.textInverse : theme.accent}
                    />
                  </View>
                  <View style={styles.cardText}>
                    <Text style={styles.cardTitle}>{option.title}</Text>
                    <Text style={styles.cardDescription}>{option.description}</Text>
                  </View>
                  {isSelected && (
                    <Ionicons name="checkmark-circle" size={22} color={theme.accent} />
                  )}
                </View>
              </PressableScale>
            );
          })}
        </View>

        <View style={styles.bottomSection}>
          <Button
            title="Continue"
            onPress={handleContinue}
            variant="primary"
            style={styles.button}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      // Transparent so the app-wide gradient shows through.
      backgroundColor: 'transparent',
    },
    content: {
      flex: 1,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.lg,
    },
    topSection: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.xl,
    },
    backButton: {
      padding: spacing.xxs,
    },
    headerSection: {
      marginBottom: spacing.xl,
    },
    headline: {
      ...typography.displaySmall,
      color: theme.textPrimary,
      marginBottom: spacing.xs,
    },
    subtext: {
      ...typography.bodyMedium,
      color: theme.textSecondary,
    },
    cardsSection: {
      flex: 1,
      gap: spacing.sm,
    },
    cardOuter: {
      borderWidth: 1.5,
      borderColor: 'transparent',
      borderRadius: radius.md,
      minHeight: 76,
      overflow: 'hidden',
    },
    cardInner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.md,
    },
    cardSelected: {
      borderColor: theme.accent,
    },
    iconWrap: {
      width: 40,
      height: 40,
      borderRadius: radius.full,
      backgroundColor: theme.bg,
      justifyContent: 'center',
      alignItems: 'center',
    },
    cardText: {
      flex: 1,
    },
    cardTitle: {
      ...typography.titleMedium,
      color: theme.textPrimary,
      marginBottom: 2,
    },
    cardDescription: {
      ...typography.bodySmall,
      color: theme.textSecondary,
    },
    bottomSection: {
      width: '100%',
      marginTop: spacing.lg,
    },
    button: {
      width: '100%',
    },
  });
