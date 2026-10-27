import React, { useRef, useCallback, useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Alert,
  Modal,
  Platform,
  KeyboardAvoidingView,
  Linking,
  Share,
  TextInput,
  Pressable,
} from 'react-native';
import Constants from 'expo-constants';
import { AppInfo } from '../../components/settings/AppInfo';
import { useDesign } from '../../design/DesignContext';
import { ACCENT_LABELS, ACCENTS, AccentName, layoutV2, typeV2 } from '../../theme/v2';
import { TopBar } from '../../components/v2/TopBar';
import { Mark } from '../../components/v2/Mark';
import { PillButton } from '../../components/v2/PillButton';
import { Tap } from '../../components/v2/Tap';
import { Sheet } from '../../components/v2/Sheet';
import { reportProblem } from '../../lib/sentry';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { GlassCard } from '../../components/GlassCard';
import { PressableScale } from '../../components/PressableScale';
import { FajrBoundaryCard } from '../../components/FajrBoundaryCard';
import { CarryOverSetting } from '../../components/CarryOverSetting';
import { useTabBarFootprint } from '../../components/LiquidGlassTabBar';
import { SettingSwitch } from '../../components/settings/SettingSwitch';
import { SettingIcon } from '../../components/settings/SettingIcon';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { shadows } from '../../theme/shadows';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { systemAppearanceAvailable, useTheme } from '../../context/ThemeContext';
import { ThemeColors } from '../../theme/colors';
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
  setHomePrefs,
  toggleHomeMetric,
  useHomePrefs,
} from '../../lib/homePrefs';

type NavigationProp = NativeStackNavigationProp<HomeStackParamList, 'Settings'>;

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 15, 30, 45];

type IconName = keyof typeof Ionicons.glyphMap;

// ---------------------------------------------------------------------------
// Reusable bits — kept inline since they're tightly coupled to settings rows.
// ---------------------------------------------------------------------------

function Section({ title, footer, children }: { title?: string; footer?: string; children: React.ReactNode }) {
  const { theme, palette } = useTheme();
  const { isNew } = useDesign();
  if (isNew) {
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
  return (
    <View style={{ marginBottom: spacing.lg }}>
      {title && (
        <Text
          style={[typography.label, { color: theme.textMuted, marginBottom: spacing.xs, paddingHorizontal: spacing.md }]}
          accessibilityRole="header"
        >
          {title}
        </Text>
      )}
      <View style={{ borderRadius: radius.md, overflow: 'hidden' }}>
        <GlassCard style={StyleSheet.absoluteFillObject} />
        {children}
      </View>
      {footer ? (
        <Text style={[typography.bodySmall, { color: theme.textMuted, marginTop: spacing.xs, paddingHorizontal: spacing.md }]}>
          {footer}
        </Text>
      ) : null}
    </View>
  );
}

/** A row's icon: a tinted tile (classic) or a plain 24pt glyph (new design). */
function RowIcon({ name, color, destructive }: { name: IconName; color?: string; destructive?: boolean }) {
  const { theme, palette } = useTheme();
  const { isNew } = useDesign();
  if (isNew) return <Ionicons name={name} size={24} color={destructive ? palette.red : palette.text} />;
  return (
    <View style={[styles.rowIcon, { backgroundColor: (color ?? theme.accent) + '20' }]}>
      <Ionicons name={name} size={16} color={color ?? theme.accent} />
    </View>
  );
}

function Row({
  icon,
  iconColor,
  label,
  value,
  rightSlot,
  onPress,
  destructive,
  isLast,
}: {
  icon?: IconName;
  iconColor?: string;
  label: string;
  value?: string;
  rightSlot?: React.ReactNode;
  onPress?: () => void;
  destructive?: boolean;
  isLast?: boolean;
}) {
  const { theme, palette } = useTheme();
  const { isNew } = useDesign();
  const labelColor = destructive ? theme.error : theme.textPrimary;

  if (isNew) {
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
      <Tap onPress={onPress} accessibilityRole="button" accessibilityLabel={value ? `${label}, ${value}` : label}>
        {row}
      </Tap>
    );
  }

  const inner = (
    <View
      style={[
        styles.row,
        !isLast && {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.border,
        },
      ]}
    >
      {icon && <RowIcon name={icon} color={iconColor} />}
      <View style={styles.rowText}>
        <Text style={[typography.bodyMedium, { color: labelColor }]}>{label}</Text>
      </View>
      {value !== undefined && (
        // Shrinks (with an ellipsis) before the label does, and never takes
        // more than about half the row, so a long name can't hide the label.
        <Text
          style={[typography.bodyMedium, styles.rowValue, { color: theme.textSecondary }]}
          numberOfLines={1}
        >
          {value}
        </Text>
      )}
      {rightSlot}
      {onPress && !rightSlot && (
        <Ionicons
          name="chevron-forward"
          size={18}
          color={theme.textMuted}
          style={{ marginLeft: spacing.xs }}
        />
      )}
    </View>
  );

  if (!onPress) return inner;
  return (
    <PressableScale onPress={onPress} haptic="light" scale={0.99}>
      {inner}
    </PressableScale>
  );
}

// Theme picker uses the legacy segmented control (LiquidGlassSegmentedControl
// dropped Ionicon glyphs inside the glass surface — root cause unclear).
function ThemeSegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string; icon?: IconName }>;
  value: T;
  onChange: (v: T) => void;
}) {
  const { theme } = useTheme();
  const { isNew } = useDesign();
  if (isNew) {
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
  return (
    <View style={styles.segmented}>
      <GlassCard style={StyleSheet.absoluteFillObject} />
      {options.map((opt) => {
        const isSelected = opt.value === value;
        return (
          <PressableScale
            key={opt.value}
            onPress={() => {
              Haptics.selectionAsync();
              onChange(opt.value);
            }}
            haptic="none"
            scale={0.97}
            style={[
              styles.segment,
              isSelected && [styles.segmentSelected, { backgroundColor: theme.surface, ...shadows.sm }],
            ]}
          >
            {opt.icon && (
              <Ionicons
                name={opt.icon}
                size={14}
                color={isSelected ? theme.textPrimary : theme.textSecondary}
                style={{ marginRight: 4 }}
              />
            )}
            <Text
              style={[
                typography.bodySmall,
                {
                  color: isSelected ? theme.textPrimary : theme.textSecondary,
                  fontWeight: '600',
                },
              ]}
            >
              {opt.label}
            </Text>
          </PressableScale>
        );
      })}
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
  const { theme, themeMode, setThemeMode, isDark } = useTheme();
  const design = useDesign();
  const tabFootprint = useTabBarFootprint();
  const screenStyles = useMemo(() => makeStyles(theme), [theme]);
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
      <SafeAreaView style={screenStyles.container}>
        <View style={screenStyles.loadingContainer}>
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
              'Type DELETE on the next screen to confirm. Once we delete your data, there is no recovery.',
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
    <SafeAreaView style={screenStyles.container}>
      {design.isNew ? (
        <TopBar title="Settings" onBack={() => navigation.goBack()} separator />
      ) : (
        <View style={screenStyles.header}>
          <PressableScale
            onPress={() => navigation.goBack()}
            haptic="light"
            style={screenStyles.backButton}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="chevron-back" size={24} color={theme.textPrimary} />
          </PressableScale>
          <Text style={screenStyles.headerTitle}>Settings</Text>
          <View style={screenStyles.backButton} />
        </View>
      )}

      <ScrollView
        contentContainerStyle={design.isNew ? [v2.content, { paddingBottom: tabFootprint + spacing.lg }] : screenStyles.content}
        testID="settings-scroll"
      >
        {design.allowed && (
          // Testers only (lib/testerTools): switch the whole app to the redesign in
          // progress and back, to compare. Kept on this device.
          <Section title="Preview" footer="The redesign in progress, for testers. Switch back any time.">
            <Row
              icon="flask-outline"
              label="New design (preview)"
              isLast={!design.isNew}
              rightSlot={
                <SettingSwitch
                  value={design.isNew}
                  onValueChange={(on) => design.setChosen(on ? 'new' : 'classic')}
                  accessibilityLabel="New design (preview)"
                  testID="new-design-switch"
                />
              }
            />
            {design.isNew && (
              // A trial: the colour on actions, links, the active tab, "done"
              // and the calendar (theme/v2 ACCENT_TOKENS).
              <View style={[styles.row, { borderBottomWidth: 0 }]} testID="accent-row">
                <SettingIcon name="color-filter-outline" tileStyle={styles.rowIcon} />
                <View style={styles.rowText}>
                  <Text style={[typeV2.body, { color: theme.textPrimary }]}>Accent</Text>
                </View>
                <ThemeSegmentedControl<AccentName>
                  value={design.accent}
                  onChange={design.setAccent}
                  options={ACCENTS.map((a) => ({ value: a, label: ACCENT_LABELS[a] }))}
                />
              </View>
            )}
          </Section>
        )}

        {firebaseUser && (
          <Section title="Account">
            <View
              style={[
                design.isNew ? v2.profileRow : screenStyles.profileRow,
                { borderBottomColor: theme.border },
              ]}
            >
              {design.isNew ? (
                <Mark label={avatarInitial(localUser.name, firebaseUser.email)} />
              ) : (
                <View style={[screenStyles.avatar, { backgroundColor: theme.accent }]}>
                  <Text style={[typography.titleLarge, { color: theme.textInverse }]}>
                    {avatarInitial(localUser.name, firebaseUser.email)}
                  </Text>
                </View>
              )}
              <View style={{ flex: 1, minWidth: 0, marginLeft: design.isNew ? layoutV2.markGap : spacing.md }}>
                {/* Long names wrap to a second line before shrinking or cutting. */}
                {localUser.name?.trim() ? (
                  <Text
                    style={[design.isNew ? typeV2.name : typography.titleMedium, { color: theme.textPrimary }]}
                    numberOfLines={2}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                  >
                    {localUser.name.trim()}
                  </Text>
                ) : null}
                <Text
                  style={[design.isNew ? typeV2.meta : typography.bodySmall, { color: theme.textSecondary }]}
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
              isLast
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
            isLast
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
          {homePrefs.showProgressCard &&
            ALL_HOME_METRICS.map((metric, i) => {
              const selected = homePrefs.metrics.includes(metric);
              return (
                <Row
                  key={metric}
                  label={HOME_METRIC_LABELS[metric]}
                  onPress={() => toggleHomeMetric(metric)}
                  rightSlot={
                    <Ionicons
                      name="checkmark"
                      size={20}
                      color={selected ? theme.accent : 'transparent'}
                    />
                  }
                />
              );
            })}
          <Row
            icon="book-outline"
            label="Friday Al-Kahf reminder"
            isLast
            rightSlot={
              <SettingSwitch
                value={homePrefs.fridayKahfReminder}
                onValueChange={(v) => setHomePrefs({ fridayKahfReminder: v })}
              />
            }
          />
        </Section>

        <Section title="Reading">
          <Row
            icon="sunny-outline"
            label="Keep screen on while reading"
            isLast
            rightSlot={
              <SettingSwitch
                value={homePrefs.keepScreenOn}
                onValueChange={(v) => setHomePrefs({ keepScreenOn: v })}
                accessibilityLabel="Keep screen on while reading, revising or listening"
              />
            }
          />
        </Section>

        <Section title="Day boundary">
          <FajrBoundaryCard />
        </Section>

        <Section title="Revision">
          <View
            style={[
              styles.row,
              {
                flexDirection: 'column',
                alignItems: 'stretch',
                gap: spacing.xs,
              },
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%', gap: spacing.sm }}>
              <SettingIcon name={design.isNew ? 'analytics-outline' : 'sparkles-outline'} tileStyle={styles.rowIcon} />
              <View style={styles.rowText}>
                <Text style={[design.isNew ? typeV2.body : typography.bodyMedium, { color: theme.textPrimary }]}>Smart Tracking</Text>
              </View>
              <SettingSwitch
                value={localUser.smartTrackingEnabled}
                onValueChange={(v) => updateUser({ smartTrackingEnabled: v })}
              />
            </View>
            {!localUser.smartTrackingEnabled && (
              <Text
                style={[
                  typography.bodySmall,
                  { color: theme.textSecondary, marginLeft: 36, marginRight: spacing.md },
                ]}
              >
                Turn on to rate pages from the session menu and see personalized insights.
              </Text>
            )}
          </View>
          {!design.isNew && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.border }} />}
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
            isLast
          />
        </Section>

        <Section title="Appearance">
          <View style={[styles.row, { borderBottomWidth: 0 }]}>
            <SettingIcon name="color-palette-outline" tileStyle={styles.rowIcon} />
            <View style={styles.rowText}>
              <Text style={[design.isNew ? typeV2.body : typography.bodyMedium, { color: theme.textPrimary }]}>Theme</Text>
            </View>
            <ThemeSegmentedControl
              value={themeMode}
              onChange={setThemeMode}
              options={
                design.isNew && systemAppearanceAvailable()
                  ? [
                      { value: 'system', label: 'System', icon: 'phone-portrait-outline' },
                      { value: 'light', label: 'Light', icon: 'sunny-outline' },
                      { value: 'dark', label: 'Dark', icon: 'moon-outline' },
                    ]
                  : [
                      { value: 'light', label: 'Light', icon: 'sunny-outline' },
                      { value: 'dark', label: 'Dark', icon: 'moon-outline' },
                    ]
              }
            />
          </View>
        </Section>

        {design.isNew && (
          <Section title="Haptics" footer="Only for moments that matter: a page done, a session finished.">
            <Row
              icon="phone-portrait-outline"
              label="Haptics"
              isLast
              rightSlot={
                <SettingSwitch
                  value={design.hapticsOn}
                  onValueChange={design.setHapticsOn}
                  accessibilityLabel="Haptics"
                />
              }
            />
          </Section>
        )}

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
              Linking.openURL('mailto:privacy@revisely.app?subject=Revisely%20support')
            }
            isLast
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
              iconColor={theme.error}
              label="Delete account"
              destructive
              onPress={handleDeleteAccount}
              isLast
            />
          </Section>
        )}

        <Text style={screenStyles.versionText}>
          Revisely · v{Constants.expoConfig?.version ?? '1.0.0'}
        </Text>

        {__DEV__ && (
          <Section title="Dev">
            <Row
              icon="refresh-outline"
              label="Replay onboarding"
              onPress={handleReplayOnboarding}
              isLast
            />
          </Section>
        )}
      </ScrollView>

      {/* Time picker sheet */}
      <BottomSheetModal visible={showTimeModal} onClose={() => setShowTimeModal(false)}>
        <View style={screenStyles.sheetHeader}>
          <PressableScale
            onPress={() => setShowTimeModal(false)}
            haptic="light"
            style={{ padding: spacing.xxs }}
          >
            <Text style={[typography.bodyMedium, { color: theme.textSecondary }]}>Cancel</Text>
          </PressableScale>
          <Text style={[typography.titleMedium, { color: theme.textPrimary }]}>Reminder time</Text>
          <PressableScale
            onPress={handleSaveTime}
            haptic="medium"
            style={{ padding: spacing.xxs }}
          >
            <Text style={[typography.bodyMedium, { color: theme.accent, fontWeight: '700' }]}>Save</Text>
          </PressableScale>
        </View>

        <View style={screenStyles.timePickerContainer}>
          <View style={screenStyles.timeColumn}>
            <Text style={[design.isNew ? typeV2.meta : typography.label, { color: theme.textMuted, marginBottom: spacing.xs }]}>Hour</Text>
            <ScrollView style={screenStyles.timeScroll} showsVerticalScrollIndicator={false}>
              {HOURS.map((hour) => {
                const selected = tempHour === hour;
                return (
                  <PressableScale
                    key={hour}
                    onPress={() => setTempHour(hour)}
                    haptic="selection"
                    scale={0.96}
                    style={[
                      screenStyles.timeOption,
                      selected && { backgroundColor: theme.accentSoft },
                    ]}
                  >
                    <Text
                      style={[
                        typography.titleMedium,
                        {
                          color: selected ? theme.accent : theme.textSecondary,
                          fontWeight: selected ? '700' : '400',
                          textAlign: 'center',
                        },
                      ]}
                    >
                      {hour.toString().padStart(2, '0')}
                    </Text>
                  </PressableScale>
                );
              })}
            </ScrollView>
          </View>

          <Text style={[typography.displayLarge, { color: theme.textPrimary, marginHorizontal: spacing.xs }]}>:</Text>

          <View style={screenStyles.timeColumn}>
            <Text style={[design.isNew ? typeV2.meta : typography.label, { color: theme.textMuted, marginBottom: spacing.xs }]}>Minute</Text>
            <ScrollView style={screenStyles.timeScroll} showsVerticalScrollIndicator={false}>
              {MINUTES.map((minute) => {
                const selected = tempMinute === minute;
                return (
                  <PressableScale
                    key={minute}
                    onPress={() => setTempMinute(minute)}
                    haptic="selection"
                    scale={0.96}
                    style={[
                      screenStyles.timeOption,
                      selected && { backgroundColor: theme.accentSoft },
                    ]}
                  >
                    <Text
                      style={[
                        typography.titleMedium,
                        {
                          color: selected ? theme.accent : theme.textSecondary,
                          fontWeight: selected ? '700' : '400',
                          textAlign: 'center',
                        },
                      ]}
                    >
                      {minute.toString().padStart(2, '0')}
                    </Text>
                  </PressableScale>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </BottomSheetModal>

      {/* Display name sheet */}
      <BottomSheetModal
        visible={showNameModal}
        onClose={() => setShowNameModal(false)}
        // Focus once the sheet is up, so the keyboard lifts a visible sheet.
        onShow={() => nameInputRef.current?.focus()}
      >
        <View style={screenStyles.sheetHeader}>
          <PressableScale
            onPress={() => setShowNameModal(false)}
            haptic="light"
            style={{ padding: spacing.xxs }}
          >
            <Text style={[typography.bodyMedium, { color: theme.textSecondary }]}>Cancel</Text>
          </PressableScale>
          <Text style={[typography.titleMedium, { color: theme.textPrimary }]}>Display name</Text>
          <PressableScale
            onPress={handleSaveName}
            haptic="medium"
            style={{ padding: spacing.xxs }}
          >
            <Text style={[typography.bodyMedium, { color: theme.accent, fontWeight: '700' }]}>Save</Text>
          </PressableScale>
        </View>

        <View style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
          <Text style={[typography.bodySmall, { color: theme.textSecondary, marginBottom: spacing.sm }]}>
            How you'd like to be addressed in the app.
          </Text>
          <TextInput
            ref={nameInputRef}
            value={tempName}
            onChangeText={setTempName}
            placeholder="Your name"
            placeholderTextColor={theme.textMuted}
            maxLength={40}
            returnKeyType="done"
            onSubmitEditing={handleSaveName}
            style={[
              {
                ...typography.bodyLarge,
                color: theme.textPrimary,
                backgroundColor: isDark
                  ? 'rgba(255,255,255,0.08)'
                  : 'rgba(0,0,0,0.06)',
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
                borderRadius: radius.sm,
                borderWidth: 1,
                borderColor: theme.border,
              },
            ]}
          />
        </View>
      </BottomSheetModal>

      <BottomSheetModal
        visible={showFeedbackModal}
        onClose={() => setShowFeedbackModal(false)}
      >
        <View style={screenStyles.sheetHeader}>
          <PressableScale
            onPress={() => setShowFeedbackModal(false)}
            haptic="light"
            style={{ padding: spacing.xxs }}
          >
            <Text style={[typography.bodyMedium, { color: theme.textSecondary }]}>Cancel</Text>
          </PressableScale>
          <Text style={[typography.titleMedium, { color: theme.textPrimary }]}>Send feedback</Text>
          <PressableScale
            onPress={handleSubmitFeedback}
            haptic="medium"
            style={{ padding: spacing.xxs }}
            disabled={feedbackSubmitting || feedbackText.trim().length === 0}
          >
            <Text
              style={[
                typography.bodyMedium,
                {
                  color:
                    feedbackSubmitting || feedbackText.trim().length === 0
                      ? theme.textMuted
                      : theme.accent,
                  fontWeight: '700',
                },
              ]}
            >
              {feedbackSubmitting ? 'Sending…' : 'Submit'}
            </Text>
          </PressableScale>
        </View>

        <View style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
          <Text style={[typography.bodySmall, { color: theme.textSecondary, marginBottom: spacing.sm }]}>
            Found a bug or have an idea? Tell us anything — we read every note.
          </Text>
          <TextInput
            value={feedbackText}
            onChangeText={setFeedbackText}
            placeholder="What's on your mind?"
            placeholderTextColor={theme.textMuted}
            multiline
            maxLength={2000}
            textAlignVertical="top"
            style={[
              {
                ...typography.bodyMedium,
                color: theme.textPrimary,
                backgroundColor: isDark
                  ? 'rgba(255,255,255,0.08)'
                  : 'rgba(0,0,0,0.06)',
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
                borderRadius: radius.sm,
                borderWidth: 1,
                borderColor: theme.border,
                minHeight: 140,
              },
            ]}
          />
        </View>
      </BottomSheetModal>
    </SafeAreaView>
  );
}

// Polished modal-as-sheet. The KeyboardAvoidingView lifts the sheet above
// the keyboard: without it, the auto-focused name field's keyboard covers the
// whole (short) sheet the instant it opens, so it looks like nothing happened.
function BottomSheetModal({
  visible,
  onClose,
  onShow,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  onShow?: () => void;
  children: React.ReactNode;
}) {
  const { theme } = useTheme();
  const { isNew } = useDesign();
  const sheetStyles = useMemo(() => makeSheetStyles(theme), [theme]);
  if (isNew) {
    return (
      <Sheet visible={visible} onClose={onClose} onShow={onShow} keyboard>
        <View style={{ paddingTop: spacing.sm }}>{children}</View>
      </Sheet>
    );
  }
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      onShow={onShow}
    >
      <KeyboardAvoidingView
        style={sheetStyles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={sheetStyles.overlay} onPress={onClose}>
          <Pressable style={sheetStyles.sheet} onPress={() => {}}>
            <GlassCard style={StyleSheet.absoluteFillObject} />
            <View style={sheetStyles.dragHandle} />
            {children}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Styles (shared row/segmented + screen-scoped)
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 52,
    gap: spacing.sm,
  },
  rowIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.xs,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowText: {
    flex: 1,
  },
  rowValue: {
    flexShrink: 1,
    maxWidth: '55%',
    textAlign: 'right',
  },
  segmented: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: radius.sm,
    gap: 2,
    overflow: 'hidden',
  },
  segment: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
    paddingVertical: 6,
    borderRadius: radius.xs,
  },
  segmentSelected: {},
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
});

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent' },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
    headerTitle: { ...typography.titleLarge, color: theme.textPrimary },
    content: {
      paddingHorizontal: spacing.sm,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xl,
    },
    profileRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    avatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    versionText: {
      ...typography.bodySmall,
      color: theme.textMuted,
      textAlign: 'center',
      marginTop: spacing.lg,
      marginBottom: spacing.lg,
    },
    sheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.lg,
    },
    capacityDisplay: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'center',
      gap: spacing.xs,
      marginBottom: spacing.sm,
    },
    sliderLabels: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: spacing.xxs,
    },
    timePickerContainer: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'flex-start',
      paddingVertical: spacing.sm,
    },
    timeColumn: { alignItems: 'center', width: 96 },
    timeScroll: { maxHeight: 200, width: '100%' },
    timeOption: {
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.sm,
      marginVertical: 2,
    },
  });

const makeSheetStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    fill: { flex: 1 },
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    sheet: {
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      paddingTop: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.xl,
      overflow: 'hidden',
      ...shadows.lg,
    },
    dragHandle: {
      width: 40,
      height: 4,
      backgroundColor: theme.border,
      alignSelf: 'center',
      marginBottom: spacing.md,
      borderRadius: radius.full,
    },
  });
