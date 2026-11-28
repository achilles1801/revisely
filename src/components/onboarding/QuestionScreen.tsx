import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ScreenSafeAreaView } from '../SafeAreaView';
import { IconButton } from '../v2/TopBar';
import { useTheme } from '../../context/ThemeContext';
import { layoutV2, typeV2 } from '../../theme/v2';
import { t } from '../../i18n';
import { backIcon } from '../../i18n/direction';

/** Onboarding's questions: what's memorized, which juz, each day, day start, reminder. */
export const QUESTIONS = 5;
/** The beginner path's (BEGIN-1): what's memorized, which surahs, day start, reminder. */
export const BEGINNER_QUESTIONS = 4;

/** One bar per question, those reached in the primary fill. */
function QuestionProgress({ step, total }: { step: number; total: number }) {
  const { palette } = useTheme();
  return (
    <View
      style={styles.progress}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t('common.stepNOfTotal', { n: step, total })}
      accessibilityValue={{ min: 1, max: total, now: step }}
      testID="question-progress"
    >
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={[styles.segment, { backgroundColor: i < step ? palette.primary : palette.outline }]}
          testID={`step-${i + 1}`}
        />
      ))}
    </View>
  );
}

/**
 * One question on a screen (ONBOARD-3): back and the progress, the question, its answer, and at most the action at the
 * foot. The middle scrolls only when it has to (the largest text sizes), so the foot never leaves the screen.
 */
export function QuestionScreen({
  step,
  total = QUESTIONS,
  title,
  subtitle,
  onBack,
  foot,
  children,
  testID,
}: {
  step: number;
  /** How many questions this path has: today's five, or the beginner path's four (BEGIN-1). */
  total?: number;
  title: string;
  subtitle?: string;
  onBack: () => void;
  foot?: React.ReactNode;
  children?: React.ReactNode;
  testID: string;
}) {
  const { palette } = useTheme();
  return (
    <ScreenSafeAreaView style={[styles.container, { backgroundColor: palette.bg }]} testID={testID}>
      <View style={styles.bar}>
        <View style={styles.back}>
          <IconButton icon={backIcon()} onPress={onBack} label={t('common.back')} size={26} testID="back" />
        </View>
        <QuestionProgress step={step} total={total} />
      </View>
      <ScrollView style={styles.middle} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={[typeV2.largeTitle, { color: palette.text }]} accessibilityRole="header" maxFontSizeMultiplier={1.6}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[typeV2.body, styles.subtitle, { color: palette.secondary }]} maxFontSizeMultiplier={1.6}>
            {subtitle}
          </Text>
        ) : null}
        <View style={styles.answer}>{children}</View>
      </ScrollView>
      {foot ? <View style={styles.foot}>{foot}</View> : null}
    </ScreenSafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingStart: 10, paddingEnd: 56 },
  back: { width: 40, alignItems: 'center', justifyContent: 'center' },
  progress: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4, paddingStart: 6 },
  segment: { flex: 1, height: 3, borderRadius: 2 },
  middle: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: layoutV2.gutter, paddingTop: 18, paddingBottom: 16 },
  subtitle: { marginTop: 8 },
  answer: { marginTop: 24 },
  foot: { paddingHorizontal: layoutV2.gutter, paddingTop: 8, paddingBottom: 16, gap: 10 },
});
