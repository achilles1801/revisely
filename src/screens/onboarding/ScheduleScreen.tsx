import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, Switch, Platform, Alert } from 'react-native';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { OnboardingStackParamList } from '../../navigation/OnboardingNavigator';
import { Button } from '../../components/Button';
import { PressableScale } from '../../components/PressableScale';
import { LiquidGlassSegmentedControl } from '../../components/LiquidGlassSegmentedControl';
import { Stepper } from '../../components/Stepper';
import { PillButton } from '../../components/v2/PillButton';
import { PillTabs } from '../../components/v2/PillTabs';
import { Toggle, TopBar } from '../../components/v2/TopBar';
import { useTheme } from '../../context/ThemeContext';
import { useDesign } from '../../design/DesignContext';
import { useHaptics } from '../../design/haptics';
import { ThemeColors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { layoutV2, typeV2 } from '../../theme/v2';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import {
  ensureNotificationsPermission,
  scheduleDailyReminder,
} from '../../lib/notifications';
import { DEFAULT_FAJR_METHOD } from '../../lib/fajrBoundary';
import { getJuzForPage } from '../../lib/quranData';

type DayBoundary = 'midnight' | 'fajr';
type ScheduleMode = 'pages' | 'juz';

type NavigationProp = NativeStackNavigationProp<OnboardingStackParamList, 'Schedule'>;
type RouteProps = RouteProp<OnboardingStackParamList, 'Schedule'>;

export default function ScheduleScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { theme, palette } = useTheme();
  const { isNew } = useDesign();
  // Classic: always on, as before. New design: Settings → Haptics decides.
  const haptics = useHaptics();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { journeyStage } = route.params;
  const { pages, createDefaultUser, saveUser, completeOnboarding } = useApp();
  const { firebaseUser } = useAuth();

  const defaultCapacity = journeyStage === 'complete' ? 20 : 10;

  const [dailyCapacity, setDailyCapacity] = useState(defaultCapacity);
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>('pages');
  const [dailyJuzCount, setDailyJuzCount] = useState(1);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [lastCapacityTick, setLastCapacityTick] = useState(defaultCapacity);
  const [lastJuzTick, setLastJuzTick] = useState(1);
  const [dayBoundary, setDayBoundary] = useState<DayBoundary>('fajr');
  const [starting, setStarting] = useState(false);

  const memorizedCount = useMemo(
    () => pages.filter((p) => p.status === 'memorized').length,
    [pages],
  );

  // Count how many distinct juz the user has memorized pages in — drives the
  // cycle math in juz mode.
  const memorizedJuzCount = useMemo(() => {
    const set = new Set<number>();
    for (const p of pages) {
      if (p.status === 'memorized') set.add(getJuzForPage(p.pageNumber));
    }
    return set.size;
  }, [pages]);

  // Cycle length is derived from how many pages (or juz) the user has memorized
  // and the daily quota. No need to ask — they'd just be doing this math in
  // their head.
  const derivedCycleDays = useMemo(() => {
    if (scheduleMode === 'juz') {
      if (memorizedJuzCount === 0 || dailyJuzCount === 0) return 0;
      return Math.ceil(memorizedJuzCount / dailyJuzCount);
    }
    if (memorizedCount === 0 || dailyCapacity === 0) return 0;
    return Math.ceil(memorizedCount / dailyCapacity);
  }, [scheduleMode, memorizedCount, dailyCapacity, memorizedJuzCount, dailyJuzCount]);

  const handleCapacityChange = (v: number) => {
    const rounded = Math.round(v);
    if (rounded !== lastCapacityTick) {
      haptics.selection();
      setLastCapacityTick(rounded);
    }
    setDailyCapacity(rounded);
  };

  const handleJuzCountChange = (v: number) => {
    const rounded = Math.round(v);
    if (rounded !== lastJuzTick) {
      haptics.selection();
      setLastJuzTick(rounded);
    }
    setDailyJuzCount(rounded);
  };

  const requestLocationOrFallback = async (): Promise<
    { latitude: number; longitude: number } | null
  > => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return null;
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
    } catch {
      return null;
    }
  };

  const handleStart = async () => {
    if (starting) return;
    setStarting(true);

    // Resolve fajr coords up-front so the boundary works on day one. If the
    // user picked fajr but permission isn't granted, fall back to midnight
    // and let them re-enable it in Settings later.
    let fajrBoundaryEnabled = false;
    let locationCoords: { latitude: number; longitude: number } | null = null;
    if (dayBoundary === 'fajr') {
      const coords = await requestLocationOrFallback();
      if (coords) {
        fajrBoundaryEnabled = true;
        locationCoords = coords;
      } else {
        Alert.alert(
          'Location not available',
          'Without location we can\'t compute fajr. Defaulting to midnight — switch in Settings once you grant location.',
        );
      }
    }

    // Ask for notification permission inline with the onboarding toggle — if
    // the user declined the OS prompt, flip our own flag off so the Settings
    // toggle reflects reality rather than promising notifications we can't
    // deliver. Skipping this means we'd silently schedule against a denied
    // permission and the user would never know why nothing fires.
    let finalNotificationsEnabled = notificationsEnabled;
    if (notificationsEnabled) {
      const granted = await ensureNotificationsPermission();
      if (!granted) finalNotificationsEnabled = false;
    }

    const user = createDefaultUser({
      name: firebaseUser?.displayName || undefined,
      dailyPageCapacity: dailyCapacity,
      scheduleMode,
      dailyJuzCount,
      notificationsEnabled: finalNotificationsEnabled,
      fajrBoundaryEnabled,
      locationCoords,
      fajrCalculationMethod: DEFAULT_FAJR_METHOD,
    });
    haptics.success();
    // saveUser, the daily reminder schedule, and the onboarding flag flip are
    // independent — running them in parallel collapses three sequential
    // round-trips into one so the navigation flip to Main is near-instant.
    await Promise.all([
      saveUser(user),
      scheduleDailyReminder(user.reminderTime, user.notificationsEnabled),
      completeOnboarding(),
    ]);
  };

  const headlineText =
    journeyStage === 'complete' ? 'Set your maintenance schedule' : 'Set your rhythm';

  const cycleText =
    derivedCycleDays > 0
      ? `Full revision cycle: ~${derivedCycleDays} day${derivedCycleDays === 1 ? '' : 's'}`
      : null;

  if (isNew) {
    const pagesMode = scheduleMode === 'pages';
    const amount = pagesMode ? dailyCapacity : dailyJuzCount;
    const unit = pagesMode ? 'pages' : dailyJuzCount === 1 ? 'juz' : 'ajzaʼ';
    // Flat sections on hairlines, as in Settings: the amount (Pages or Juz,
    // then a slider), when the day resets, and reminders. "Start" stays at the foot.
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: palette.bg }]} testID="schedule">
        <TopBar onBack={() => navigation.goBack()} center={<Stepper total={3} current={3} />} />
        <ScrollView style={styles.scrollView} contentContainerStyle={v2.scroll} testID="schedule-scroll">
          <View style={[v2.header, { borderBottomColor: palette.separator }]}>
            <Text
              style={[typeV2.title, { color: palette.text }]}
              accessibilityRole="header"
              maxFontSizeMultiplier={1.6}
            >
              {headlineText}
            </Text>
            <Text style={[typeV2.body, v2.subtext, { color: palette.secondary }]}>
              You can change any of these later in Settings.
            </Text>
          </View>

          <SectionV2 title="How much per day?">
            <View style={v2.block}>
              <PillTabs<ScheduleMode>
                options={[
                  { value: 'pages', label: 'Pages' },
                  { value: 'juz', label: 'Juz' },
                ]}
                value={scheduleMode}
                onChange={setScheduleMode}
                testID="schedule-mode"
              />
              <View style={v2.amountRow} accessible accessibilityLabel={`${amount} ${unit} a day`}>
                <Text
                  style={[typeV2.largeTitle, typeV2.numeral, { color: palette.text }]}
                  maxFontSizeMultiplier={1.6}
                  testID="schedule-amount"
                >
                  {amount}
                </Text>
                <Text style={[typeV2.body, { color: palette.secondary }]} maxFontSizeMultiplier={1.6}>
                  {unit}
                </Text>
              </View>
              <Slider
                key={scheduleMode}
                style={v2.slider}
                minimumValue={1}
                maximumValue={pagesMode ? 60 : 5}
                step={1}
                value={amount}
                onValueChange={pagesMode ? handleCapacityChange : handleJuzCountChange}
                minimumTrackTintColor={palette.primary}
                maximumTrackTintColor={palette.separator}
                thumbTintColor={palette.primary}
                accessibilityLabel={pagesMode ? 'Pages a day' : 'Juz a day'}
                testID="schedule-slider"
              />
              <View style={v2.sliderLabels}>
                <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={1.6}>
                  1
                </Text>
                <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={1.6}>
                  {pagesMode ? 60 : 5}
                </Text>
              </View>
              {cycleText ? (
                <Text style={[typeV2.meta, v2.helper, { color: palette.secondary }]} testID="schedule-cycle">
                  {cycleText}
                </Text>
              ) : null}
            </View>
          </SectionV2>

          <SectionV2 title="When does your day reset?">
            <View style={v2.block}>
              <PillTabs<DayBoundary>
                options={[
                  { value: 'fajr', label: 'At fajr', icon: 'moon-outline' },
                  { value: 'midnight', label: 'At midnight', icon: 'time-outline' },
                ]}
                value={dayBoundary}
                onChange={setDayBoundary}
                testID="schedule-boundary"
              />
              {dayBoundary === 'fajr' && (
                <Text style={[typeV2.meta, v2.helper, { color: palette.secondary }]}>
                  We'll ask for your location to compute fajr accurately.
                </Text>
              )}
            </View>
          </SectionV2>

          <SectionV2>
            <View style={v2.row}>
              <View style={v2.rowText}>
                <Text style={[typeV2.body, { color: palette.text }]}>Daily reminders</Text>
                <Text style={[typeV2.meta, { color: palette.secondary }]}>
                  Get a nudge each day so revision stays consistent.
                </Text>
              </View>
              <Toggle
                value={notificationsEnabled}
                onValueChange={setNotificationsEnabled}
                accessibilityLabel="Daily reminders"
                testID="schedule-reminders"
              />
            </View>
          </SectionV2>
        </ScrollView>

        <View style={v2.footer}>
          <PillButton
            title={starting ? 'Setting up…' : 'Start'}
            size="lg"
            onPress={handleStart}
            busy={starting}
            testID="schedule-start"
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <View style={styles.topSection}>
          <PressableScale
            onPress={() => navigation.goBack()}
            haptic="light"
            style={styles.backButton}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="chevron-back" size={24} color={theme.textSecondary} />
          </PressableScale>
          <Stepper total={3} current={3} />
        </View>

        <View style={styles.headerSection}>
          <Text style={styles.headline}>{headlineText}</Text>
          <Text style={styles.subtext}>You can always adjust later.</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>How much per day?</Text>
          <View style={styles.modeToggleRow}>
            <LiquidGlassSegmentedControl<ScheduleMode>
              options={[
                { value: 'pages', label: 'Pages' },
                { value: 'juz', label: 'Juz' },
              ]}
              value={scheduleMode}
              onChange={setScheduleMode}
            />
          </View>

          {scheduleMode === 'pages' ? (
            <>
              <View style={styles.bigNumberRow}>
                <Text style={styles.bigNumber}>{dailyCapacity}</Text>
                <Text style={styles.bigNumberLabel}>pages</Text>
              </View>
              <Slider
                style={styles.slider}
                minimumValue={1}
                maximumValue={60}
                step={1}
                value={dailyCapacity}
                onValueChange={handleCapacityChange}
                minimumTrackTintColor={theme.accent}
                maximumTrackTintColor={theme.border}
                thumbTintColor={theme.accent}
              />
              <View style={styles.sliderLabels}>
                <Text style={styles.sliderLabel}>1</Text>
                <Text style={styles.sliderLabel}>60</Text>
              </View>
            </>
          ) : (
            <>
              <View style={styles.bigNumberRow}>
                <Text style={styles.bigNumber}>{dailyJuzCount}</Text>
                <Text style={styles.bigNumberLabel}>
                  {dailyJuzCount === 1 ? 'juz' : 'ajzaʼ'}
                </Text>
              </View>
              <Slider
                style={styles.slider}
                minimumValue={1}
                maximumValue={5}
                step={1}
                value={dailyJuzCount}
                onValueChange={handleJuzCountChange}
                minimumTrackTintColor={theme.accent}
                maximumTrackTintColor={theme.border}
                thumbTintColor={theme.accent}
              />
              <View style={styles.sliderLabels}>
                <Text style={styles.sliderLabel}>1</Text>
                <Text style={styles.sliderLabel}>5</Text>
              </View>
            </>
          )}
          {cycleText && <Text style={styles.helperText}>{cycleText}</Text>}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>When does your day reset?</Text>
          <View style={styles.boundaryRow}>
            <PressableScale
              onPress={() => {
                Haptics.selectionAsync();
                setDayBoundary('fajr');
              }}
              haptic="none"
              scale={0.98}
              style={[
                styles.boundaryButton,
                {
                  borderColor: dayBoundary === 'fajr' ? theme.accent : theme.border,
                  backgroundColor:
                    dayBoundary === 'fajr' ? theme.accent + '15' : 'transparent',
                },
              ]}
            >
              <Ionicons
                name="moon-outline"
                size={18}
                color={dayBoundary === 'fajr' ? theme.accent : theme.textSecondary}
              />
              <Text
                style={[
                  styles.boundaryLabel,
                  {
                    color:
                      dayBoundary === 'fajr' ? theme.textPrimary : theme.textSecondary,
                    fontWeight: dayBoundary === 'fajr' ? '600' : '500',
                  },
                ]}
              >
                At fajr
              </Text>
              {/* <Text style={[styles.boundarySub, { color: theme.textMuted }]}>
                Late-night counts as today
              </Text> */}
            </PressableScale>

            <PressableScale
              onPress={() => {
                Haptics.selectionAsync();
                setDayBoundary('midnight');
              }}
              haptic="none"
              scale={0.98}
              style={[
                styles.boundaryButton,
                {
                  borderColor:
                    dayBoundary === 'midnight' ? theme.accent : theme.border,
                  backgroundColor:
                    dayBoundary === 'midnight' ? theme.accent + '15' : 'transparent',
                },
              ]}
            >
              <Ionicons
                name="time-outline"
                size={18}
                color={dayBoundary === 'midnight' ? theme.accent : theme.textSecondary}
              />
              <Text
                style={[
                  styles.boundaryLabel,
                  {
                    color:
                      dayBoundary === 'midnight' ? theme.textPrimary : theme.textSecondary,
                    fontWeight: dayBoundary === 'midnight' ? '600' : '500',
                  },
                ]}
              >
                At midnight
              </Text>
              {/* <Text style={[styles.boundarySub, { color: theme.textMuted }]}>
                Standard clock day
              </Text> */}
            </PressableScale>
          </View>
          {dayBoundary === 'fajr' && (
            <Text style={styles.helperText}>
              We'll ask for your location to compute fajr accurately.
            </Text>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.notificationRow}>
            <View style={styles.notificationText}>
              <Text style={styles.sectionTitle}>Daily reminders</Text>
              <Text style={styles.helperText}>
                Get a nudge each day so revision stays consistent.
              </Text>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={(v) => {
                Haptics.selectionAsync();
                setNotificationsEnabled(v);
              }}
              trackColor={{ false: theme.border, true: theme.accent }}
              thumbColor={Platform.OS === 'android' ? theme.bg : undefined}
            />
          </View>
        </View>

        <View style={styles.disclosureRow}>
          <Ionicons name="information-circle-outline" size={16} color={theme.textMuted} />
          <Text style={styles.disclosureText}>
            You can change any of these later in Settings.
          </Text>
        </View>

        <View style={styles.bottomSection}>
          <Button
            title={starting ? 'Setting up…' : 'Start'}
            onPress={handleStart}
            variant="primary"
            disabled={starting}
            style={styles.button}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/** A flat group as in Settings: a sentence-case header, its rows, a closing hairline. */
function SectionV2({ title, children }: { title?: string; children: React.ReactNode }) {
  const { palette } = useTheme();
  return (
    <View style={[v2.section, { borderBottomColor: palette.separator }]}>
      {title ? (
        <Text
          style={[typeV2.name, v2.sectionTitle, { color: palette.text }]}
          accessibilityRole="header"
          maxFontSizeMultiplier={1.6}
        >
          {title}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

const v2 = StyleSheet.create({
  scroll: { paddingBottom: 24 },
  header: {
    paddingHorizontal: layoutV2.gutter,
    paddingTop: 8,
    paddingBottom: 20,
    borderBottomWidth: layoutV2.hairline,
  },
  subtext: { marginTop: 4 },
  section: { paddingTop: 8, paddingBottom: 8, borderBottomWidth: layoutV2.hairline },
  sectionTitle: { paddingHorizontal: layoutV2.gutter, paddingTop: 12, paddingBottom: 8 },
  block: { paddingHorizontal: layoutV2.gutter, paddingBottom: 12 },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 6,
    marginTop: 20,
    marginBottom: 4,
  },
  slider: { width: '100%', height: 40 },
  sliderLabels: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
  helper: { marginTop: 8, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingVertical: 12,
    paddingHorizontal: layoutV2.gutter,
    gap: 16,
  },
  rowText: { flex: 1, minWidth: 0 },
  footer: { paddingHorizontal: layoutV2.gutter, paddingTop: 8, paddingBottom: 16 },
});

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent' },
    scrollView: { flex: 1 },
    content: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.xl,
    },
    topSection: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.xl,
    },
    backButton: { padding: spacing.xxs },
    headerSection: { marginBottom: spacing.xl },
    headline: { ...typography.displaySmall, color: theme.textPrimary, marginBottom: spacing.xs },
    subtext: { ...typography.bodyMedium, color: theme.textSecondary },
    section: { marginBottom: spacing.xl },
    sectionTitle: { ...typography.label, color: theme.textMuted, marginBottom: spacing.md },
    modeToggleRow: {
      marginBottom: spacing.md,
    },
    bigNumberRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'center',
      gap: spacing.xs,
      marginBottom: spacing.sm,
    },
    bigNumber: {
      ...typography.displayLarge,
      color: theme.accent,
    },
    bigNumberLabel: { ...typography.bodyLarge, color: theme.textSecondary },
    slider: { width: '100%', height: 40 },
    sliderLabels: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.xs,
    },
    sliderLabel: { ...typography.bodySmall, color: theme.textMuted },
    helperText: {
      ...typography.bodySmall,
      color: theme.textMuted,
      marginTop: spacing.xs,
      textAlign: 'center',
    },
    notificationRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    notificationText: { flex: 1 },
    boundaryRow: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    boundaryButton: {
      flex: 1,
      borderWidth: 1.5,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.sm,
      gap: spacing.xs,
      alignItems: 'flex-start',
    },
    boundaryLabel: {
      ...typography.bodyMedium,
    },
    boundarySub: {
      ...typography.bodySmall,
      fontSize: 11,
    },
    disclosureRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.sm,
      marginBottom: spacing.lg,
    },
    disclosureText: {
      ...typography.bodySmall,
      color: theme.textMuted,
      flex: 1,
    },
    bottomSection: { width: '100%', marginTop: spacing.md },
    button: { width: '100%' },
  });
