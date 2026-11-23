import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { ScreenSafeAreaView } from '../../components/SafeAreaView';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { OnboardingStackParamList } from '../../navigation/OnboardingNavigator';
import { HeroGlow } from '../../components/v2/HeroGlow';
import { PillButton } from '../../components/v2/PillButton';
import { useTheme } from '../../context/ThemeContext';
import { useReduceMotion } from '../../design/motion';
import { arabicV2, layoutV2, typeV2 } from '../../theme/v2';
import { t } from '../../i18n';

type NavigationProp = NativeStackNavigationProp<OnboardingStackParamList, 'Welcome'>;

export default function WelcomeScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { palette } = useTheme();
  const reduceMotion = useReduceMotion();

  // One soft fade for the words, then the action. Reduce Motion shows them at once.
  const words = useSharedValue(reduceMotion ? 1 : 0);
  const action = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (reduceMotion) {
      words.value = 1;
      action.value = 1;
      return;
    }
    const ease = { duration: 500, easing: Easing.out(Easing.cubic) };
    words.value = withTiming(1, ease);
    action.value = withDelay(250, withTiming(1, ease));
  }, [reduceMotion]);

  const wordsAnim = useAnimatedStyle(() => ({
    opacity: words.value,
    transform: [{ translateY: (1 - words.value) * 10 }],
  }));
  const actionAnim = useAnimatedStyle(() => ({ opacity: action.value }));

  // The salam over the glow, the words in the middle, the one action at the foot. The middle scrolls, so the largest
  // text sizes never push "Begin" off the screen.
  return (
    <ScreenSafeAreaView style={[styles.container, { backgroundColor: palette.bg }]} testID="welcome">
      <HeroGlow />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Animated.View style={[styles.top, wordsAnim]}>
          <Text style={[arabicV2(26), { color: palette.text }]} accessibilityLanguage="ar" maxFontSizeMultiplier={1.4} testID="salam">
            السلام عليكم
          </Text>
        </Animated.View>

        <Animated.View style={[styles.middle, wordsAnim]}>
          <Text style={[styles.headline, { color: palette.text }]} accessibilityRole="header" maxFontSizeMultiplier={1.6}>
            {t('onboarding.welcome.title')}
            {'\n'}
            <Text style={{ color: palette.accentText }} testID="welcome-accent">
              {t('onboarding.welcome.accent')}
            </Text>
            .
          </Text>
          <Text style={[typeV2.menu, styles.body, { color: palette.secondary }]} maxFontSizeMultiplier={1.6}>
            {t('onboarding.welcome.body')}
          </Text>
        </Animated.View>
      </ScrollView>

      <Animated.View style={[styles.foot, actionAnim]}>
        <PillButton title={t('onboarding.welcome.begin')} size="lg" onPress={() => navigation.navigate('JourneySelect')} testID="welcome-begin" />
        <Text style={[typeV2.meta, styles.note, { color: palette.secondary }]} maxFontSizeMultiplier={1.4}>
          {t('onboarding.welcome.note')}
        </Text>
      </Animated.View>
    </ScreenSafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: layoutV2.gutter + 8, paddingTop: 40, paddingBottom: 24 },
  top: { alignItems: 'center' },
  middle: { flex: 1, justifyContent: 'center', paddingVertical: 32 },
  headline: { fontSize: 36, lineHeight: 42, fontWeight: '700', letterSpacing: -0.8 },
  // Narrow enough to break after the comma on every phone.
  body: { marginTop: 12, maxWidth: 270, lineHeight: 24 },
  foot: { paddingHorizontal: layoutV2.gutter, paddingTop: 8, paddingBottom: 16, gap: 10 },
  note: { textAlign: 'center' },
});
