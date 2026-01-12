import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { OnboardingStackParamList, JourneyStage } from '../../navigation/OnboardingNavigator';
import { Button } from '../../components/Button';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { useApp } from '../../context/AppContext';

type NavigationProp = NativeStackNavigationProp<OnboardingStackParamList, 'JourneySelect'>;

export default function JourneySelectScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { pages, updatePages } = useApp();
  const [selectedStage, setSelectedStage] = useState<JourneyStage>('in_progress');

  const handleContinue = async () => {
    // For 'complete' journey, mark all pages as memorized and skip JuzSelection
    if (selectedStage === 'complete') {
      const allMemorized = pages.map(p => ({
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
    } else {
      // For other journey stages, go to JuzSelection
      navigation.navigate('JuzSelection', { journeyStage: selectedStage });
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.topSection}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.stepIndicator}>
            {selectedStage === 'complete' ? 'Step 1 of 3' : 'Step 1 of 4'}
          </Text>
          <Text style={styles.headline}>Where are you in your journey?</Text>
        </View>

        <View style={styles.cardsSection}>
          <TouchableOpacity
            style={[
              styles.card,
              selectedStage === 'beginning' && styles.cardSelected,
            ]}
            onPress={() => setSelectedStage('beginning')}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.cardTitle,
                selectedStage === 'beginning' && styles.cardTitleSelected,
              ]}
            >
              Beginning
            </Text>
            <Text
              style={[
                styles.cardDescription,
                selectedStage === 'beginning' && styles.cardDescriptionSelected,
              ]}
            >
              Starting my first juz
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.card,
              selectedStage === 'in_progress' && styles.cardSelected,
            ]}
            onPress={() => setSelectedStage('in_progress')}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.cardTitle,
                selectedStage === 'in_progress' && styles.cardTitleSelected,
              ]}
            >
              In Progress
            </Text>
            <Text
              style={[
                styles.cardDescription,
                selectedStage === 'in_progress' && styles.cardDescriptionSelected,
              ]}
            >
              Memorizing actively
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.card,
              selectedStage === 'complete' && styles.cardSelected,
            ]}
            onPress={() => setSelectedStage('complete')}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.cardTitle,
                selectedStage === 'complete' && styles.cardTitleSelected,
              ]}
            >
              Complete
            </Text>
            <Text
              style={[
                styles.cardDescription,
                selectedStage === 'complete' && styles.cardDescriptionSelected,
              ]}
            >
              Maintaining 30 juz
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.bottomSection}>
          <Button
            title={selectedStage === 'complete' ? 'Skip to Schedule' : 'Continue'}
            onPress={handleContinue}
            variant="primary"
            style={styles.button}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    flex: 1,
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
  cardsSection: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.bgAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 0,
    padding: spacing.lg,
    minHeight: 100,
    justifyContent: 'center',
  },
  cardSelected: {
    backgroundColor: colors.bgDark,
    borderColor: colors.bgDark,
  },
  cardTitle: {
    ...typography.displaySmall,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  cardTitleSelected: {
    color: colors.textInverse,
  },
  cardDescription: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
  },
  cardDescriptionSelected: {
    color: colors.textInverse,
    opacity: 0.9,
  },
  bottomSection: {
    width: '100%',
  },
  button: {
    width: '100%',
  },
});
