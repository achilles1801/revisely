import React, { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { OnboardingStackParamList } from '../../navigation/OnboardingNavigator';
import { Button } from '../../components/Button';
import { useTheme } from '../../context/ThemeContext';
import { ThemeColors } from '../../theme/colors';
import { typography, fonts } from '../../theme/typography';
import { spacing } from '../../theme/spacing';

type NavigationProp = NativeStackNavigationProp<OnboardingStackParamList, 'Welcome'>;

export default function WelcomeScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  // Soft sequenced fade-in for the hero elements.
  const bismillahOpacity = useSharedValue(0);
  const headlineOpacity = useSharedValue(0);
  const subtextOpacity = useSharedValue(0);
  const buttonOpacity = useSharedValue(0);

  useEffect(() => {
    const ease = { duration: 600, easing: Easing.out(Easing.cubic) };
    bismillahOpacity.value = withTiming(1, ease);
    headlineOpacity.value = withDelay(200, withTiming(1, ease));
    subtextOpacity.value = withDelay(400, withTiming(1, ease));
    buttonOpacity.value = withDelay(600, withTiming(1, ease));
  }, []);

  const bismillahAnim = useAnimatedStyle(() => ({
    opacity: bismillahOpacity.value,
    transform: [{ translateY: (1 - bismillahOpacity.value) * 12 }],
  }));
  const headlineAnim = useAnimatedStyle(() => ({
    opacity: headlineOpacity.value,
    transform: [{ translateY: (1 - headlineOpacity.value) * 12 }],
  }));
  const subtextAnim = useAnimatedStyle(() => ({
    opacity: subtextOpacity.value,
  }));
  const buttonAnim = useAnimatedStyle(() => ({
    opacity: buttonOpacity.value,
  }));

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Animated.View style={[styles.topSection, bismillahAnim]}>
          <Text style={styles.bismillah}>بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</Text>
          <View style={styles.ornament} />
        </Animated.View>

        <View style={styles.centerSection}>
          <Animated.Text style={[styles.headline, headlineAnim]}>
            Your Quran,{'\n'}<Text style={styles.italic}>remembered</Text>.
          </Animated.Text>
          <Animated.Text style={[styles.subtext, subtextAnim]}>
            A personal revision companion. Track what you've memorized, review at the right moment, and never lose a page.
          </Animated.Text>
        </View>

        <Animated.View style={[styles.bottomSection, buttonAnim]}>
          <Button
            title="Begin"
            onPress={() => navigation.navigate('JourneySelect')}
            variant="primary"
            style={styles.button}
          />
        </Animated.View>
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
      paddingTop: spacing.xxl,
      paddingBottom: spacing.xl,
      justifyContent: 'space-between',
    },
    topSection: {
      alignItems: 'center',
      marginTop: spacing.xxl,
    },
    bismillah: {
      fontFamily: fonts.arabic,
      // Match the dashboard's salam color (textPrimary) so Arabic text is
      // consistent across the app instead of being one-off accent-colored.
      color: theme.textPrimary,
      fontSize: 24,
      letterSpacing: 0.5,
      textAlign: 'center',
    },
    ornament: {
      width: 32,
      height: 1,
      backgroundColor: theme.border,
      marginTop: spacing.md,
    },
    centerSection: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: spacing.xs,
    },
    headline: {
      ...typography.displayLarge,
      color: theme.textPrimary,
      textAlign: 'center',
      marginBottom: spacing.lg,
    },
    italic: {
      fontStyle: 'italic',
      color: theme.accent,
    },
    subtext: {
      ...typography.bodyLarge,
      color: theme.textSecondary,
      textAlign: 'center',
      maxWidth: 320,
    },
    bottomSection: {
      width: '100%',
    },
    button: {
      width: '100%',
    },
  });
