import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from '../../components/SafeAreaView';
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
import { HeroGlow } from '../../components/v2/HeroGlow';
import { PillButton } from '../../components/v2/PillButton';
import { useTheme } from '../../context/ThemeContext';
import { arabicV2, layoutV2, typeV2 } from '../../theme/v2';

type NavigationProp = NativeStackNavigationProp<OnboardingStackParamList, 'Welcome'>;

export default function WelcomeScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { palette } = useTheme();

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

  // Flat ground with the accent's glow at the top (Jade glows in light only), the
  // words in the middle and the one action at the foot. The middle scrolls,
  // so the largest text sizes never push "Begin" off the screen.
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.bg }]} testID="welcome">
      <HeroGlow />
      <ScrollView contentContainerStyle={v2.scroll} showsVerticalScrollIndicator={false}>
        <Animated.View style={[v2.top, bismillahAnim]}>
          <Text
            style={[arabicV2(24), v2.center, { color: palette.text }]}
            accessibilityLanguage="ar"
            maxFontSizeMultiplier={1.6}
          >
            بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
          </Text>
        </Animated.View>

        <View style={v2.middle}>
          <Animated.Text
            style={[typeV2.largeTitle, v2.center, v2.headline, { color: palette.text }, headlineAnim]}
            accessibilityRole="header"
            maxFontSizeMultiplier={1.6}
          >
            Your Quran,{'\n'}
            <Text style={{ color: palette.accentText }} testID="welcome-accent">
              remembered
            </Text>
            .
          </Animated.Text>
          <Animated.Text style={[typeV2.body, v2.center, v2.subtext, { color: palette.secondary }, subtextAnim]}>
            A personal revision companion. Track what you've memorized, review at the right moment, and never lose a page.
          </Animated.Text>
        </View>
      </ScrollView>

      <Animated.View style={[v2.footer, buttonAnim]}>
        <PillButton
          title="Begin"
          size="lg"
          onPress={() => navigation.navigate('JourneySelect')}
          testID="welcome-begin"
        />
      </Animated.View>
    </SafeAreaView>
  );
}

const v2 = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    paddingHorizontal: layoutV2.gutter,
    paddingTop: 48,
    paddingBottom: 24,
  },
  top: { alignItems: 'center' },
  center: { textAlign: 'center' },
  middle: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 32 },
  headline: { marginBottom: 12 },
  subtext: { maxWidth: 320 },
  footer: { paddingHorizontal: layoutV2.gutter, paddingTop: 8, paddingBottom: 16 },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
});
