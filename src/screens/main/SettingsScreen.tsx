import React, { useRef, useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Alert,
  Platform,
  Linking,
  Share,
  TextInput,
  LayoutAnimation,
  AccessibilityState,
} from 'react-native';
import Constants from 'expo-constants';
import { AppInfo } from '../../components/settings/AppInfo';
import { useDesign } from '../../design/DesignContext';
import { layoutV2, radiusV2, typeV2 } from '../../theme/v2';
import { useHaptics } from '../../design/haptics';
import { AccentPicker } from '../../components/settings/AccentPicker';
import { TopBar } from '../../components/v2/TopBar';
import { Mark } from '../../components/v2/Mark';
import { PillButton } from '../../components/v2/PillButton';
import { Tap } from '../../components/v2/Tap';
import { Sheet } from '../../components/v2/Sheet';
import { reportProblem } from '../../lib/sentry';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { FajrBoundaryCard } from '../../components/FajrBoundaryCard';
import { CarryOverSetting } from '../../components/CarryOverSetting';
import { useTabBarFootprint } from '../../navigation/TabBar';
import { SettingSwitch } from '../../components/settings/SettingSwitch';
import { SettingIcon } from '../../components/settings/SettingIcon';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { systemAppearanceAvailable, useTheme } from '../../context/ThemeContext';
import { HomeStackParamList } from '../../navigation/MainNavigator';
import { scheduleDailyReminder } from '../../lib/notifications';
import * as firestoreService from '../../services/firestoreService';
import { getTotalAppUsageSeconds } from '../../lib/appUsage';
import { formatDuration } from '../../lib/readingTimer';
import { avatarInitial } from '../../lib/displayName';
import { deleteAllRecordings, listRecordings } from '../../lib/recordings';
import { askTurnOffBackup, backupLabel, deleteAllEverywhere, useBackupStatus } from '../../lib/recordingBackupUi';
import { formatBytes } from '../../lib/recordingFormat';
import { logger } from '../../lib/logger';
import {
  ALL_HOME_METRICS,
  HOME_METRIC_LABELS,
  homeMetricsSummary,
  PROGRESS_STYLE_LABELS,
  PROGRESS_STYLES,
  setHomePrefs,
  toggleHomeMetric,
  useHomePrefs,
} from '../../lib/homePrefs';
import { usePersistedFlag } from '../../hooks/usePersistedFlag';
import { supportMailto } from '../../lib/contact';
import { isTester } from '../../lib/tester';
import { PillTabs } from '../../components/v2/PillTabs';

type NavigationProp = NativeStackNavigationProp<HomeStackParamList, 'Settings'>;

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 15, 30, 45];

type IconName = keyof typeof Ionicons.glyphMap;

// ---------------------------------------------------------------------------
// Reusable bits — kept inline since they're tightly coupled to settings rows.
// ---------------------------------------------------------------------------

function Section({ title, footer, children }: { title?: string; footer?: string; children: React.ReactNode }) {
  const { palette } = useTheme();
  // A flat list: a bold sentence-case header, rows on the ground, a hairline
  // closing the group.
  return (
    <View style={[v2.section, { borderBottomColor: palette.separator }]}>
      {title ? (
        <Text style={[typeV2.name, v2.sectionTitle, { color: palette.text }]} accessibilityRole="header">
          {title}
        </Text>
      ) : null}
      {children}
      {footer ? <Text style={[typeV2.meta, v2.footer, { color: palette.secondary }]}>{footer}</Text> : null}
    </View>
  );
}

/** A row's icon: a plain 24pt glyph. */
function RowIcon({ name, destructive }: { name: IconName; destructive?: boolean }) {
  const { palette } = useTheme();
  return <Ionicons name={name} size={24} color={destructive ? palette.red : palette.text} />;
}

function Row({
  icon,
  label,
  value,
  rightSlot,
  onPress,
  destructive,
  accessibilityState,
}: {
  icon?: IconName;
  label: string;
  value?: string;
  rightSlot?: React.ReactNode;
  onPress?: () => void;
  destructive?: boolean;
  accessibilityState?: AccessibilityState;
}) {
  const { palette } = useTheme();
  const row = (
    <View style={v2.row}>
      {icon ? <RowIcon name={icon} destructive={destructive} /> : null}
      <Text
        style={[typeV2.body, v2.rowLabel, !icon && v2.indent, { color: destructive ? palette.red : palette.text }]}
      >
        {label}
      </Text>
      {value !== undefined && (
        <Text style={[typeV2.body, styles.rowValue, { color: palette.secondary }]} numberOfLines={1}>
          {value}
        </Text>
      )}
      {rightSlot}
      {onPress && !rightSlot && <Ionicons name="chevron-forward" size={16} color={palette.secondary} />}
    </View>
  );
  if (!onPress) return row;
  return (
    <Tap
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
      accessibilityState={accessibilityState}
    >
      {row}
    </Tap>
  );
}

/** The theme choice: a pill per option, the chosen one solid. */
function ThemeSegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={v2.pills}>
      {options.map((opt) => (
        <PillButton
          key={opt.value}
          title={opt.label}
          size="sm"
          variant={opt.value === value ? 'solid' : 'outline'}
          onPress={() => onChange(opt.value)}
          accessibilityLabel={`${opt.label}${opt.value === value ? ', selected' : ''}`}
        />
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function SettingsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { user, saveUser, resetOnboarding } = useApp();
  const { firebaseUser, signOutUser, deleteAccount } = useAuth();
  const { theme, palette, themeMode, setThemeMode } = useTheme();
  const design = useDesign();
  const tabFootprint = useTabBarFootprint();
  const [localUser, setLocalUser] = useState(user);

  // Keep `localUser` in sync with the context user so we never persist a
  // stale snapshot back to Firestore. Without this, opening Settings,
  // changing one field elsewhere (or via Firestore subscription), then
  // saving from Settings would overwrite the freshly-changed field with
  // the stale value captured at mount.
  useEffect(() => {
    if (user) setLocalUser(user);
  }, [user]);
  const [showTimeModal, setShowTimeModal] = useState(false);
  const [showNameModal, setShowNameModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [tempHour, setTempHour] = useState(parseInt(user?.reminderTime?.split(':')[0] ?? '8'));
  const [tempMinute, setTempMinute] = useState(parseInt(user?.reminderTime?.split(':')[1] ?? '0'));
  const [tempName, setTempName] = useState(user?.name ?? '');
  const nameInputRef = useRef<TextInput>(null);
  const homePrefs = useHomePrefs();
  // The progress card's options stay folded until opened (remembered per device).
  const [metricsOpen, setMetricsOpen] = usePersistedFlag('@revisely_settings_progress_open', false);
  const toggleMetricsOpen = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.create(220, 'easeInEaseOut', 'opacity'));
    setMetricsOpen(!metricsOpen);
  }, [metricsOpen, setMetricsOpen]);
  const [readingSeconds, setReadingSeconds] = useState<number | null>(null);
  const [appSeconds, setAppSeconds] = useState<number | null>(null);
  // On this phone: how many, their size here; how many are backed up, and how
  // many are only in the backup (restored, not downloaded yet).
  const [recordings, setRecordings] = useState<{
    count: number;
    bytes: number;
    backedUp: number;
    cloudOnly: number;
  } | null>(null);

  const loadRecordings = useCallback(() => {
    listRecordings()
      .then((list) =>
        setRecordings({
          count: list.length,
          bytes: list.reduce(
            (sum, r) => sum + (r.segments.every((sg) => sg.local) ? r.sizeBytes : 0),
            0,
          ),
          backedUp: list.filter((r) => r.backedUp).length,
          cloudOnly: list.filter((r) => r.segments.some((sg) => !sg.local)).length,
        }),
      )
      .catch(() => setRecordings(null));
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      firestoreService
        .getReadingSessions()
        .then((list) => {
          if (!cancelled) setReadingSeconds(list.reduce((sum, s) => sum + s.durationSeconds, 0));
        })
        .catch(() => {});
      getTotalAppUsageSeconds()
        .then((s) => {
          if (!cancelled) setAppSeconds(s);
        })
        .catch(() => {});
      loadRecordings();
      return () => {
        cancelled = true;
      };
    }, [loadRecordings]),
  );

  if (!localUser) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={[typography.bodyMedium, { color: theme.textSecondary }]}>Loading…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const updateUser = async (updates: Partial<typeof localUser>) => {
    const updated = { ...localUser, ...updates };
    setLocalUser(updated);
    await saveUser(updated);
  };

  const handleShareApp = async () => {
    try {
      await Share.share({
        message:
          "I've been using Revisely to stay on top of my Quran memorization — give it a try: https://revisely.app",
        url: 'https://revisely.app',
      });
    } catch {
      // User dismissed the sheet or platform refused — nothing to do.
    }
  };

  const handleNotificationToggle = async (enabled: boolean) => {
    await updateUser({ notificationsEnabled: enabled });
    await scheduleDailyReminder(localUser.reminderTime, enabled);
  };

  const handleSaveName = async () => {
    const trimmed = tempName.trim();
    await updateUser({ name: trimmed.length > 0 ? trimmed : undefined });
    setShowNameModal(false);
  };

  // Recording backup (lib/recordingBackup): on by default.
  const backupStatus = useBackupStatus();
  const handleBackupToggle = (on: boolean) => {
    const save = (value: boolean) =>
      updateUser({ recordingBackup: value }).catch((err) => logger.warn('Could not change backup', err));
    if (on) save(true);
    else if (firebaseUser) askTurnOffBackup(firebaseUser.uid, () => save(false), recordings?.cloudOnly ?? 0);
  };

  const handleSubmitFeedback = async () => {
    const trimmed = feedbackText.trim();
    if (!trimmed || feedbackSubmitting) return;
    setFeedbackSubmitting(true);
    try {
      await firestoreService.submitFeedback({
        message: trimmed,
        appVersion: Constants.expoConfig?.version,
        platform: Platform.OS,
      });
      setShowFeedbackModal(false);
      setFeedbackText('');
      Alert.alert('Thank you', 'Your feedback was sent. We appreciate it.');
    } catch (err) {
      Alert.alert(
        'Couldn’t send feedback',
        err instanceof Error ? err.message : 'Please try again later.',
      );
    } finally {
      setFeedbackSubmitting(false);
    }
  };

  const handleSaveTime = async () => {
    const newTime = `${tempHour.toString().padStart(2, '0')}:${tempMinute
      .toString()
      .padStart(2, '0')}`;
    await updateUser({ reminderTime: newTime });
    await scheduleDailyReminder(newTime, localUser.notificationsEnabled);
    setShowTimeModal(false);
  };

  const handleSignOut = () => {
    Alert.alert('Sign out?', 'Your local data will be preserved.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        onPress: async () => {
          try {
            await signOutUser();
          } catch {
            Alert.alert('Error', 'Failed to sign out');
          }
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete account?',
      'This will permanently delete your account and all your revision data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            // Second confirmation — Apple wants this kind of friction.
            Alert.alert(
              'Are you absolutely sure?',
              'Your account, revision history and backed-up recordings will be deleted. There is no recovery.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'I understand, delete',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await deleteAccount();
                      Alert.alert('Account deleted', 'Your account and data have been removed.');
                    } catch (err: any) {
                      Alert.alert(
                        'Could not delete account',
                        err?.message ?? 'Please try again. If the issue persists, contact support.',
                      );
                    }
                  },
                },
              ],
            );
          },
        },
      ],
    );
  };

  const handleReplayOnboarding = () => {
    Alert.alert(
      'Replay onboarding?',
      "You'll be sent back to the Welcome screen. Your pages and progress aren't deleted.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Replay',
          onPress: async () => {
            try {
              await resetOnboarding();
            } catch {
              Alert.alert('Error', 'Failed to reset onboarding.');
            }
          },
        },
      ],
    );
  };

  const formatTime = (time: string) => {
    const [hour, minute] = time.split(':').map(Number);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minute.toString().padStart(2, '0')} ${ampm}`;
  };

  return (
    <SafeAreaView style={styles.container}>
      <TopBar title="Settings" onBack={() => navigation.goBack()} separator />

      <ScrollView contentContainerStyle={[v2.content, { paddingBottom: tabFootprint + spacing.lg }]} testID="settings-scroll">
        {firebaseUser && (
          <Section title="Account">
            <View style={v2.profileRow}>
              <Mark label={avatarInitial(localUser.name, firebaseUser.email)} />
              <View style={{ flex: 1, minWidth: 0, marginLeft: layoutV2.markGap }}>
                {/* Long names wrap to a second line before shrinking or cutting. */}
                {localUser.name?.trim() ? (
                  <Text
                    style={[typeV2.name, { color: theme.textPrimary }]}
                    numberOfLines={2}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                  >
                    {localUser.name.trim()}
                  </Text>
                ) : null}
                <Text
                  style={[typeV2.meta, { color: theme.textSecondary }]}
                  numberOfLines={1}
                  ellipsizeMode="middle"
                >
                  {firebaseUser.email}
                </Text>
              </View>
            </View>
            <Row
              icon="person-outline"
              label="Display name"
              value={localUser.name ?? 'Not set'}
              onPress={() => {
                setTempName(localUser.name ?? '');
                setShowNameModal(true);
              }}
            />
          </Section>
        )}

        <Section title="Activity">
          <Row
            icon="pulse-outline"
            label="Activity"
            value={readingSeconds != null ? `${formatDuration(readingSeconds)} timed` : undefined}
            onPress={() => navigation.navigate('Activity')}
          />
          <Row
            icon="mic-outline"
            label="Recordings"
            value={
              recordings && recordings.count > 0
                ? `${recordings.count} · ${formatBytes(recordings.bytes)}`
                : 'None'
            }
            onPress={
              recordings && recordings.count > 0
                ? () =>
                    Alert.alert(
                      'Recordings',
                      `${recordings.count} recording${recordings.count === 1 ? '' : 's'} (${formatBytes(
                        recordings.bytes,
                      )} on this phone). ${
                        recordings.backedUp === recordings.count
                          ? recordings.count === 1
                            ? 'It is backed up to your account.'
                            : 'All are backed up to your account.'
                          : recordings.backedUp > 0
                            ? `${recordings.backedUp} of them are backed up to your account.`
                            : 'They are on this phone only.'
                      }${
                        recordings.cloudOnly > 0
                          ? ` ${recordings.cloudOnly} download${recordings.cloudOnly === 1 ? 's' : ''} from your backup when played.`
                          : ''
                      } They're listed by day in Activity.`,
                      [
                        { text: 'Open Activity', onPress: () => navigation.navigate('Activity') },
                        {
                          text: 'Delete all',
                          style: 'destructive',
                          onPress: () =>
                            Alert.alert(
                              'Delete all recordings?',
                              "From this phone and from your backup. This can't be undone.",
                              [
                              { text: 'Cancel', style: 'cancel' },
                              {
                                text: 'Delete all',
                                style: 'destructive',
                                onPress: async () => {
                                  // The whole folder, including any file not in the index,
                                  // and the backup (listed first, for recordings not seen here).
                                  const uid = firebaseUser?.uid;
                                  if (uid && (await deleteAllEverywhere(uid))) {
                                    loadRecordings();
                                    return;
                                  }
                                  Alert.alert(
                                    'Couldn’t reach your backup',
                                    'Nothing was deleted. Delete the recordings on this phone only? Those in your backup stay there.',
                                    [
                                      { text: 'Cancel', style: 'cancel' },
                                      {
                                        text: 'Delete on this phone',
                                        style: 'destructive',
                                        onPress: async () => {
                                          await deleteAllRecordings(uid);
                                          loadRecordings();
                                        },
                                      },
                                    ],
                                  );
                                },
                              },
                              ],
                            ),
                        },
                        { text: 'Cancel', style: 'cancel' },
                      ],
                    )
                : undefined
            }
          />
          <Row
            icon="cloud-upload-outline"
            label="Back up recordings"
            value={localUser.recordingBackup !== false ? backupLabel(backupStatus) : undefined}
            rightSlot={
              <SettingSwitch
                value={localUser.recordingBackup !== false}
                onValueChange={handleBackupToggle}
                accessibilityLabel="Back up recordings to your account"
              />
            }
          />
          {localUser.recordingBackup !== false && (
            <Row
              icon="cellular-outline"
              label="Back up over mobile data"
              rightSlot={
                <SettingSwitch
                  value={localUser.recordingBackupCellular === true}
                  onValueChange={(v) =>
                    updateUser({ recordingBackupCellular: v }).catch((err) =>
                      logger.warn('Could not change mobile data backup', err),
                    )
                  }
                  accessibilityLabel="Back up recordings over mobile data"
                />
              }
            />
          )}
          <Row
            icon="hourglass-outline"
            label="Time in app"
            value={appSeconds != null ? formatDuration(appSeconds) : '—'}
          />
          <Row
            icon="book-outline"
            label="Memorized pages"
            onPress={() => navigation.navigate('Memorization')}
          />
        </Section>

        <Section title="Home screen">
          <Row
            icon="stats-chart-outline"
            label="Progress card"
            rightSlot={
              <SettingSwitch
                value={homePrefs.showProgressCard}
                onValueChange={(v) => setHomePrefs({ showProgressCard: v })}
              />
            }
          />
          {homePrefs.showProgressCard ? (
            // What the card shows, folded into one row until opened.
            <Row
              label="Shows"
              value={homeMetricsSummary(homePrefs.metrics)}
              onPress={toggleMetricsOpen}
              accessibilityState={{ expanded: metricsOpen }}
              rightSlot={
                <Ionicons name={metricsOpen ? 'chevron-up' : 'chevron-down'} size={16} color={theme.textMuted} />
              }
            />
          ) : null}
          {homePrefs.showProgressCard && metricsOpen
            ? ALL_HOME_METRICS.map((metric) => {
                const selected = homePrefs.metrics.includes(metric);
                return (
                  <Row
                    key={metric}
                    label={HOME_METRIC_LABELS[metric]}
                    onPress={() => toggleHomeMetric(metric)}
                    accessibilityState={{ selected }}
                    rightSlot={
                      <Ionicons
                        name="checkmark"
                        size={20}
                        color={selected ? theme.accent : 'transparent'}
                      />
                    }
                  />
                );
              })
            : null}
          {homePrefs.showProgressCard && isTester(user) ? (
            // Testers only, while the user compares them; the winner stays.
            <View style={v2.accentRow} testID="progress-style-row">
              <View style={v2.accentHead}>
                <SettingIcon name="ellipse-outline" />
                <Text style={[typeV2.body, { color: theme.textPrimary }]}>Progress style</Text>
              </View>
              <View style={v2.accentChips}>
                <PillTabs
                  options={PROGRESS_STYLES.map((s) => ({ value: s, label: PROGRESS_STYLE_LABELS[s] }))}
                  value={homePrefs.progressStyle}
                  onChange={(progressStyle) => setHomePrefs({ progressStyle })}
                  testID="progress-style"
                />
              </View>
            </View>
          ) : null}
          <Row
            icon="book-outline"
            label="Friday Al-Kahf reminder"
            rightSlot={
              <SettingSwitch
                value={homePrefs.fridayKahfReminder}
                onValueChange={(v) => setHomePrefs({ fridayKahfReminder: v })}
              />
            }
          />
        </Section>

        <Section title="Day boundary">
          <FajrBoundaryCard />
        </Section>

        <Section title="Revision">
          {/* Like Keep daily amount below: the line under the label says what it does. */}
          <View style={v2.iconRow} testID="smart-tracking-row">
            <SettingIcon name="analytics-outline" />
            <View style={v2.iconRowText}>
              <Text style={[typeV2.body, { color: palette.text }]}>Smart Tracking</Text>
              {!localUser.smartTrackingEnabled && (
                <Text style={[typeV2.meta, { color: palette.secondary }]}>
                  Turn on to rate pages from the session menu and see personalized insights.
                </Text>
              )}
            </View>
            <SettingSwitch
              value={localUser.smartTrackingEnabled}
              onValueChange={(v) => updateUser({ smartTrackingEnabled: v })}
              accessibilityLabel="Smart Tracking"
            />
          </View>
          <CarryOverSetting
            mode={localUser.carryOverMode}
            onChange={(carryOverMode) => updateUser({ carryOverMode })}
          />

        </Section>

        <Section title="Notifications">
          <Row
            icon="notifications-outline"
            label="Enable notifications"
            rightSlot={
              <SettingSwitch
                value={localUser.notificationsEnabled}
                onValueChange={handleNotificationToggle}
              />
            }
          />
          <Row
            icon="time-outline"
            label="Reminder time"
            value={formatTime(localUser.reminderTime)}
            onPress={
              localUser.notificationsEnabled
                ? () => {
                    const [h, m] = localUser.reminderTime.split(':').map(Number);
                    setTempHour(h);
                    setTempMinute(m);
                    setShowTimeModal(true);
                  }
                : undefined
            }
          />
        </Section>

        <Section title="Appearance">
          <View style={v2.iconRow}>
            <SettingIcon name="color-palette-outline" />
            <View style={styles.rowText}>
              <Text style={[typeV2.body, { color: theme.textPrimary }]}>Theme</Text>
            </View>
            <ThemeSegmentedControl
              value={themeMode}
              onChange={setThemeMode}
              options={
                systemAppearanceAvailable()
                  ? [
                      { value: 'system', label: 'System' },
                      { value: 'light', label: 'Light' },
                      { value: 'dark', label: 'Dark' },
                    ]
                  : [
                      { value: 'light', label: 'Light' },
                      { value: 'dark', label: 'Dark' },
                    ]
              }
            />
          </View>
          {/* Kept with the account (DesignGate brings it to other devices). */}
          <View style={v2.accentRow} testID="accent-row">
            <View style={v2.accentHead}>
              <SettingIcon name="color-filter-outline" />
              <Text style={[typeV2.body, { color: theme.textPrimary }]}>Accent</Text>
            </View>
            <View style={v2.accentChips}>
              <AccentPicker
                value={design.accent}
                onChange={(accent) => {
                  design.setAccent(accent);
                  updateUser({ accent });
                }}
              />
            </View>
          </View>
        </Section>

        <Section title="Haptics" footer="Only for moments that matter: a page done, a session finished.">
          <Row
            icon="phone-portrait-outline"
            label="Haptics"
            rightSlot={
              <SettingSwitch value={design.hapticsOn} onValueChange={design.setHapticsOn} accessibilityLabel="Haptics" />
            }
          />
        </Section>

        <Section title="Support">
          <Row
            icon="share-outline"
            label="Share Revisely"
            onPress={handleShareApp}
          />
          <Row
            icon="chatbubble-ellipses-outline"
            label="Send feedback"
            onPress={() => {
              setFeedbackText('');
              setShowFeedbackModal(true);
            }}
          />
          <Row
            icon="bug-outline"
            label="Report a problem"
            onPress={reportProblem}
          />
          <Row
            icon="mail-outline"
            label="Contact support"
            onPress={() =>
              Linking.openURL(supportMailto())
            }
          />
        </Section>

        <Section title="About">
          <Row
            icon="document-text-outline"
            label="Privacy Policy"
            onPress={() => Linking.openURL('https://revisely.app/privacy/')}
          />
          <Row
            icon="document-outline"
            label="Terms of Service"
            onPress={() => Linking.openURL('https://revisely.app/terms/')}
          />
          <AppInfo />
        </Section>

        {firebaseUser && (
          <Section>
            <Row
              icon="log-out-outline"
              label="Sign out"
              onPress={handleSignOut}
            />
            <Row
              icon="trash-outline"
              label="Delete account"
              destructive
              onPress={handleDeleteAccount}
            />
          </Section>
        )}

        <Text style={[typeV2.meta, v2.version, { color: palette.secondary }]} maxFontSizeMultiplier={1.4}>
          Revisely · v{Constants.expoConfig?.version ?? '1.0.0'}
        </Text>

        {__DEV__ && (
          <Section title="Dev">
            <Row
              icon="refresh-outline"
              label="Replay onboarding"
              onPress={handleReplayOnboarding}
            />
          </Section>
        )}
      </ScrollView>

      <ReminderTimeSheetV2
        visible={showTimeModal}
        hour={tempHour}
        minute={tempMinute}
        onHour={setTempHour}
        onMinute={setTempMinute}
        onCancel={() => setShowTimeModal(false)}
        onSave={handleSaveTime}
      />
      <TextSheetV2
        visible={showNameModal}
        title="Display name"
        message="How you'd like to be addressed in the app."
        value={tempName}
        onChange={setTempName}
        placeholder="Your name"
        maxLength={40}
        inputRef={nameInputRef}
        // Focus once the sheet is up, so the keyboard lifts a visible sheet.
        onShow={() => nameInputRef.current?.focus()}
        onCancel={() => setShowNameModal(false)}
        save={{ label: 'Save', onPress: handleSaveName }}
        testID="name-sheet"
      />
      <TextSheetV2
        visible={showFeedbackModal}
        title="Send feedback"
        message="Found a bug or have an idea? Tell us anything. We read every note."
        value={feedbackText}
        onChange={setFeedbackText}
        placeholder="What's on your mind?"
        maxLength={2000}
        multiline
        onCancel={() => setShowFeedbackModal(false)}
        save={{
          label: feedbackSubmitting ? 'Sending…' : 'Submit',
          onPress: handleSubmitFeedback,
          disabled: feedbackSubmitting || feedbackText.trim().length === 0,
        }}
        testID="feedback-sheet"
      />
    </SafeAreaView>
  );
}

/**
 * The new design's reminder time: a v2 Sheet (Cancel, the title, Save), the
 * hours in a column that scrolls, the minutes beside it. The chosen one sits on
 * the accent's tint.
 */
function ReminderTimeSheetV2({
  visible,
  hour,
  minute,
  onHour,
  onMinute,
  onCancel,
  onSave,
}: {
  visible: boolean;
  hour: number;
  minute: number;
  onHour: (h: number) => void;
  onMinute: (m: number) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const { palette } = useTheme();
  const haptics = useHaptics();
  const column = (label: string, values: number[], value: number, onPick: (v: number) => void) => (
    <View style={v2.timeColumn}>
      <Text style={[typeV2.meta, v2.timeLabel, { color: palette.secondary }]} maxFontSizeMultiplier={1.4}>
        {label}
      </Text>
      <ScrollView style={v2.timeScroll} showsVerticalScrollIndicator={false} testID={`time-${label.toLowerCase()}s`}>
        {values.map((v) => {
          const selected = v === value;
          const text = v.toString().padStart(2, '0');
          return (
            <Tap
              key={v}
              onPress={() => {
                if (selected) return;
                haptics.selection();
                onPick(v);
              }}
              style={[v2.timeOption, selected && { backgroundColor: palette.accentSubtle }]}
              accessibilityRole="button"
              accessibilityLabel={`${label} ${text}`}
              accessibilityState={{ selected }}
              testID={`time-${label.toLowerCase()}-${v}`}
            >
              <Text
                style={[
                  typeV2.sheetTitle,
                  typeV2.numeral,
                  v2.timeText,
                  { color: selected ? palette.accentText : palette.secondary, fontWeight: selected ? '600' : '400' },
                ]}
                maxFontSizeMultiplier={1.4}
              >
                {text}
              </Text>
            </Tap>
          );
        })}
      </ScrollView>
    </View>
  );
  return (
    <Sheet
      visible={visible}
      onClose={onCancel}
      title="Reminder time"
      left={{ label: 'Cancel', onPress: onCancel, testID: 'time-cancel' }}
      right={{ label: 'Save', onPress: onSave, strong: true, testID: 'time-save' }}
      testID="time-sheet"
    >
      <View style={v2.timePicker}>
        {column('Hour', HOURS, hour, onHour)}
        <Text style={[typeV2.title, v2.timeColon, { color: palette.text }]} maxFontSizeMultiplier={1.4}>
          :
        </Text>
        {column('Minute', MINUTES, minute, onMinute)}
      </View>
    </Sheet>
  );
}

/** The new design's one-field sheet (display name, feedback): Cancel, the title, Save. */
function TextSheetV2({
  visible,
  title,
  message,
  value,
  onChange,
  placeholder,
  maxLength,
  multiline,
  inputRef,
  onShow,
  onCancel,
  save,
  testID,
}: {
  visible: boolean;
  title: string;
  message: string;
  value: string;
  onChange: (text: string) => void;
  placeholder: string;
  maxLength: number;
  multiline?: boolean;
  inputRef?: React.RefObject<TextInput | null>;
  onShow?: () => void;
  onCancel: () => void;
  save: { label: string; onPress: () => void; disabled?: boolean };
  testID: string;
}) {
  const { palette } = useTheme();
  return (
    <Sheet
      visible={visible}
      onClose={onCancel}
      onShow={onShow}
      keyboard
      title={title}
      left={{ label: 'Cancel', onPress: onCancel, testID: `${testID}-cancel` }}
      right={{ label: save.label, onPress: save.onPress, strong: true, disabled: save.disabled, testID: `${testID}-save` }}
      testID={testID}
    >
      <View style={v2.sheetBody}>
        <Text style={[typeV2.meta, { color: palette.secondary }]}>{message}</Text>
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={palette.secondary}
          maxLength={maxLength}
          multiline={multiline}
          textAlignVertical={multiline ? 'top' : undefined}
          returnKeyType={multiline ? 'default' : 'done'}
          onSubmitEditing={multiline ? undefined : save.onPress}
          selectionColor={palette.accentText}
          style={[typeV2.body, v2.input, multiline && v2.inputMultiline, { color: palette.text, backgroundColor: palette.fill }]}
          accessibilityLabel={title}
          testID={`${testID}-input`}
        />
      </View>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  rowText: {
    flex: 1,
  },
  // A row's value shrinks (with an ellipsis) before the label does, and never
  // takes more than about half the row, so a long name can't hide the label.
  rowValue: {
    flexShrink: 1,
    maxWidth: '55%',
    textAlign: 'right',
  },
});

// The new design: full-bleed rows with a 16pt gutter, no cards.
const v2 = StyleSheet.create({
  content: {},
  section: { paddingTop: 8, paddingBottom: 8, borderBottomWidth: layoutV2.hairline },
  sectionTitle: { paddingHorizontal: layoutV2.gutter, paddingTop: 12, paddingBottom: 4 },
  footer: { paddingHorizontal: layoutV2.gutter, paddingTop: 4, paddingBottom: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingVertical: 12,
    paddingHorizontal: layoutV2.gutter,
    gap: 16,
  },
  rowLabel: { flex: 1 },
  // A row without an icon lines up with the labels of those with one.
  indent: { marginLeft: 40 },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: layoutV2.gutter,
    paddingVertical: layoutV2.rowPad,
  },
  pills: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' },
  accentRow: { paddingHorizontal: layoutV2.gutter, paddingTop: 4, paddingBottom: 12 },
  accentHead: { flexDirection: 'row', alignItems: 'center', minHeight: 32, gap: 8 },
  // Under the label: the icon (24), its 8pt and the row's 8pt.
  accentChips: { marginLeft: 40, marginTop: 8 },
  // A row built around SettingIcon, which brings 8pt after its glyph: 8 more
  // makes the 16 of the other rows.
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingVertical: 12,
    paddingHorizontal: layoutV2.gutter,
    gap: 8,
  },
  iconRowText: { flex: 1, marginRight: 8 },
  version: { textAlign: 'center', marginTop: 24, marginBottom: 24 },
  // Sheets.
  sheetBody: { paddingTop: 8, paddingBottom: 4, gap: 12 },
  input: { borderRadius: radiusV2.media, paddingHorizontal: 14, paddingVertical: 12 },
  // A minimum, not a height: the field grows with its text and with Dynamic Type.
  inputMultiline: { minHeight: 140 },
  timePicker: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start', paddingVertical: 8 },
  timeColumn: { alignItems: 'center', width: 104 },
  timeLabel: { marginBottom: 8 },
  timeScroll: { maxHeight: 220, width: '100%' },
  timeOption: { paddingVertical: 8, borderRadius: radiusV2.chip, marginVertical: 1 },
  timeText: { textAlign: 'center' },
  timeColon: { marginHorizontal: 8, marginTop: 28 },
});

