import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { OnboardingStackParamList, JourneyStage } from '../../navigation/OnboardingNavigator';
import { Button } from '../../components/Button';
import { PressableScale } from '../../components/PressableScale';
import { Stepper } from '../../components/Stepper';
import { useTheme } from '../../context/ThemeContext';
import { ThemeColors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { useApp } from '../../context/AppContext';

type NavigationProp = NativeStackNavigationProp<OnboardingStackParamList, 'JourneySelect'>;

const OPTIONS: Array<{ value: JourneyStage; title: string; description: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { value: 'beginning', title: 'Beginning', description: 'Starting my first juz', icon: 'leaf-outline' },
  { value: 'in_progress', title: 'In Progress', description: 'Memorizing actively', icon: 'flame-outline' },
  { value: 'complete', title: 'Complete', description: 'Maintaining 30 juz', icon: 'star-outline' },
];

export default function JourneySelectScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { pages, updatePages } = useApp();
  const [selectedStage, setSelectedStage] = useState<JourneyStage>('in_progress');

  const handleContinue = async () => {
    if (selectedStage === 'complete') {
      const allMemorized = pages.map((p) => ({
        ...p,
        status: 'memorized' as const,
        dateMemorized: new Date().toISOString(),
      }));
      await updatePages(allMemorized);
      navigation.navigate('Schedule', {
        journeyStage: selectedStage,
        currentJuz: undefined,
        currentPage: undefined,
      });
    } else if (selectedStage === 'in_progress') {
      navigation.navigate('NaturalLanguageInput', { journeyStage: selectedStage });
    } else {
      navigation.navigate('JuzSelection', { journeyStage: selectedStage });
    }
  };

  const totalSteps = selectedStage === 'complete' ? 3 : 4;

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
          <Text style={styles.subtext}>We'll personalize your setup from here.</Text>
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
                  styles.card,
                  isSelected && styles.cardSelected,
                ]}
              >
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
              </PressableScale>
            );
          })}
        </View>

        <View style={styles.bottomSection}>
          <Button
            title={selectedStage === 'complete' ? 'Continue to schedule' : 'Continue'}
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
      backgroundColor: theme.bg,
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
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: theme.bgAlt,
      borderWidth: 1.5,
      borderColor: 'transparent',
      borderRadius: radius.md,
      padding: spacing.md,
      minHeight: 76,
    },
    cardSelected: {
      backgroundColor: theme.accentSoft,
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
