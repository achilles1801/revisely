import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { OnboardingStackParamList } from '../../navigation/OnboardingNavigator';
import { BEGINNER_QUESTIONS, QuestionScreen } from '../../components/onboarding/QuestionScreen';
import { PillButton } from '../../components/v2/PillButton';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useHaptics } from '../../design/haptics';
import { DEFAULT_FAJR_METHOD } from '../../lib/fajrBoundary';
import { firstDayPages } from '../../lib/onboardingChoices';
import { pathFieldForSetup } from '../../lib/paths';
import { reminderCopy } from '../../lib/reminders/copy';
import { radiusV2, typeV2 } from '../../theme/v2';
import { t } from '../../i18n';
import { useOnboardingAccess } from './onboardingAccess';

type NavigationProp = NativeStackNavigationProp<OnboardingStackParamList, 'Reminder'>;
type RouteProps = RouteProp<OnboardingStackParamList, 'Reminder'>;

/**
 * The last question, and the end of setup: either answer saves the account's plan and finishes onboarding. The card is
 * a reminder as this plan's first day would word it (lib/reminders/copy).
 */
export default function ReminderScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { palette } = useTheme();
  const haptics = useHaptics();
  const { user: account, pages, createDefaultUser, saveUser, completeOnboarding, askNotifications } = useOnboardingAccess();
  const { firebaseUser } = useAuth();
  const { scheduleMode, dailyCapacity, dailyJuzCount, fajrBoundaryEnabled, locationCoords, path } = route.params;
  const [starting, setStarting] = useState<'on' | 'off' | null>(null);

  const preview = useMemo(() => {
    const memorized = pages.filter((p) => p.status === 'memorized').map((p) => p.pageNumber);
    const all = firstDayPages(memorized, scheduleMode, dailyCapacity, dailyJuzCount);
    if (all.length === 0) return null;
    return reminderCopy({
      kind: 'morning',
      juzPlan: scheduleMode === 'juz',
      name: '',
      beforeNoon: true,
      all,
      remaining: all,
      overnight: false,
      streak: 0,
      tomorrow: [],
      variant: 1,
    }).body;
  }, [pages, scheduleMode, dailyCapacity, dailyJuzCount]);

  const finish = async (wantsReminders: boolean) => {
    if (starting) return;
    setStarting(wantsReminders ? 'on' : 'off');
    try {
      // Declined at the system's prompt: our own flag goes off too, so Settings says what is true and nothing is
      // scheduled against a refused permission.
      const notificationsEnabled = wantsReminders ? await askNotifications() : false;
      const user = createDefaultUser({
        name: firebaseUser?.displayName || undefined,
        dailyPageCapacity: dailyCapacity,
        scheduleMode,
        dailyJuzCount,
        notificationsEnabled,
        fajrBoundaryEnabled,
        locationCoords,
        fajrCalculationMethod: DEFAULT_FAJR_METHOD,
        // The surahs chosen as surahs earlier in setup ("Choose by surah instead", or every one with "All of it"): kept,
        // not replaced by a new account's empty list (ONBOARD-6).
        memorizedSurahs: account?.memorizedSurahs ?? [],
        // The beginner's path (PATH-1); an account that never had one writes nothing new.
        ...pathFieldForSetup(path, account),
      });
      haptics.success();
      // saveUser and the onboarding flag flip are independent: running them in
      // parallel makes the navigation flip to Main near-instant. (The reminders
      // follow the saved user: components/RevisionRemindersSync.)
      await Promise.all([saveUser(user), completeOnboarding()]);
    } finally {
      setStarting(null);
    }
  };

  return (
    <QuestionScreen
      // The beginner path's last question is its fourth (BEGIN-1); today's, the fifth.
      {...(path === 'beginner' ? { step: 4, total: BEGINNER_QUESTIONS } : { step: 5 })}
      title={t('onboarding.reminder.title')}
      subtitle={t('onboarding.reminder.subtitle')}
      onBack={() => navigation.goBack()}
      testID="reminder"
      foot={
        <>
          <PillButton
            title={t('onboarding.reminder.on')}
            size="lg"
            busy={starting === 'on'}
            disabled={starting === 'off'}
            onPress={() => finish(true)}
            testID="reminder-on"
          />
          <PillButton
            title={t('onboarding.reminder.off')}
            variant="outline"
            size="lg"
            busy={starting === 'off'}
            disabled={starting === 'on'}
            onPress={() => finish(false)}
            testID="reminder-off"
          />
        </>
      }
    >
      {preview ? (
        <View
          style={[styles.card, { backgroundColor: palette.fill, borderColor: palette.separator }]}
          accessible
          accessibilityLabel={t('onboarding.reminder.previewLabel', { text: preview })}
          testID="reminder-preview"
        >
          <View style={[styles.icon, { backgroundColor: palette.primary }]}>
            <Ionicons name="book" size={20} color={palette.onPrimary} />
          </View>
          <View style={styles.text}>
            <View style={styles.head}>
              <Text style={[typeV2.name, { color: palette.text }]} maxFontSizeMultiplier={1.4}>
                {t('onboarding.reminder.appName')}
              </Text>
              <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={1.4}>
                {t('onboarding.reminder.now')}
              </Text>
            </View>
            <Text style={[typeV2.body, { color: palette.text }]} maxFontSizeMultiplier={1.6}>
              {preview}
            </Text>
          </View>
        </View>
      ) : null}
    </QuestionScreen>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: radiusV2.sheet,
    borderWidth: StyleSheet.hairlineWidth,
  },
  icon: { width: 40, height: 40, borderRadius: radiusV2.media - 2, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, minWidth: 0 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
});
