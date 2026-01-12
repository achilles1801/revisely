import React from 'react';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { OnboardingStackParamList } from '../../navigation/OnboardingNavigator';
import { Button } from '../../components/Button';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';

type NavigationProp = NativeStackNavigationProp<OnboardingStackParamList, 'Welcome'>;

export default function WelcomeScreen() {
  const navigation = useNavigation<NavigationProp>();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.topSection}>
          <Text style={styles.bismillah}>بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</Text>
        </View>

        <View style={styles.centerSection}>
          <Text style={styles.headline}>
            Your Quran, <Text style={styles.italic}>remembered</Text>.
          </Text>
          <Text style={styles.subtext}>
            Track your memorization, optimize your revision, and maintain what you've learned with a personalized algorithm that learns your patterns.
          </Text>
        </View>

        <View style={styles.bottomSection}>
          <Button
            title="Begin"
            onPress={() => navigation.navigate('JourneySelect')}
            variant="primary"
            style={styles.button}
          />
          <Text style={styles.noAccountText}>No account needed</Text>
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
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xl,
    justifyContent: 'space-between',
  },
  topSection: {
    alignItems: 'center',
    marginTop: spacing.xxl,
  },
  bismillah: {
    ...typography.bodyMedium,
    color: colors.textMuted,
    fontSize: 18,
  },
  centerSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  headline: {
    ...typography.displayLarge,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  italic: {
    fontStyle: 'italic',
  },
  subtext: {
    ...typography.bodyLarge,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  bottomSection: {
    width: '100%',
  },
  button: {
    width: '100%',
    marginBottom: spacing.md,
  },
  noAccountText: {
    ...typography.bodySmall,
    color: colors.textMuted,
    textAlign: 'center',
  },
});

