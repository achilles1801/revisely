import React, { createContext, useContext, useRef, useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
  Linking,
  Share,
  TextInput,
  AccessibilityState,
  useWindowDimensions,
} from 'react-native';
import { TopSafeAreaView } from '../../components/SafeAreaView';
import Constants from 'expo-constants';
import { AppInfo } from '../../components/settings/AppInfo';
import { useDesign } from '../../design/DesignContext';
import { layoutV2, radiusV2, typeV2 } from '../../theme/v2';
import { AccentSetting } from '../../components/settings/AccentPicker';
import { TopBar } from '../../components/v2/TopBar';
import { Mark } from '../../components/v2/Mark';
import { PillButton } from '../../components/v2/PillButton';
import { Tap } from '../../components/v2/Tap';
import { Sheet } from '../../components/v2/Sheet';
import { reportProblem } from '../../lib/sentry';
import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { FajrBoundaryCard } from '../../components/FajrBoundaryCard';
import { SpeechModelSheet } from '../../components/recite/SpeechModelSheet';
import { ActionSheet } from '../../components/v2/ActionSheet';
import { canFollowWords } from '../../components/recite/useReciteFollow';
import { reciteModeEnabled } from '../../lib/recite/availability';
import { formatModelSize } from '../../lib/recite/speechModel';
import { removeSpeechModel, useSpeechModelState } from '../../lib/recite/speechModelStore';
import { PrayerSheet, PrayerTab } from '../../components/prayer/PrayerSheet';
import { usePrayerTimes } from '../../components/prayer/usePrayerTimes';
import { prayerTimesEnabled } from '../../lib/prayer/status';
import { PRAYERS, setPrayerPrefs, usePrayerPrefs } from '../../lib/prayer/prefs';
import { formatTime as formatPrayerTime, methodLabel, TIME_LABELS } from '../../lib/prayer/times';
import { formatBearing, qiblaBearing, nearestCity, bundledCities } from '../../lib/qibla';
import { CarryOverSetting } from '../../components/CarryOverSetting';
import { useTabBarFootprint } from '../../navigation/TabBar';
import { SettingSwitch } from '../../components/settings/SettingSwitch';
import { HELP_ICON } from '../../components/help/HelpButton';
import { useHelpButtons } from '../../components/help/useHelpButtons';
import { SettingIcon } from '../../components/settings/SettingIcon';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { useApp } from '../../context/AppContext';
import { showsUpdateTools } from '../../lib/updates/testerTools';
import { useAuth } from '../../context/AuthContext';
import { systemAppearanceAvailable, useTheme } from '../../context/ThemeContext';
import { HomeStackParamList } from '../../navigation/MainNavigator';
import type { RevoSettingsSection } from '../../lib/revo/types';
import * as firestoreService from '../../services/firestoreService';
import { getTotalAppUsageSeconds } from '../../lib/appUsage';
import { formatDuration } from '../../lib/readingTimer';
import { avatarInitial } from '../../lib/displayName';
import { deleteAllRecordings, listRecordings } from '../../lib/recordings';
import { askTurnOffBackup, backupLabel, deleteAllEverywhere, useBackupStatus } from '../../lib/recordingBackupUi';
import { formatBytes } from '../../lib/recordingFormat';
import { logger } from '../../lib/logger';
import { setHomePrefs, useHomePrefs } from '../../lib/homePrefs';
import { supportMailto } from '../../lib/contact';
import { PillTabs } from '../../components/v2/PillTabs';
import { setMushafCellular } from '../../lib/mushafOffline';
import { describeMushaf, mushafMenuActions, useMushafOffline } from '../../lib/mushafOfflineUi';
import { mushafEdition, useMushafEdition } from '../../lib/mushafEdition';
import { MushafPickerSheet } from '../../components/mushaf/MushafPickerSheet';
import { shareIcon } from '../../lib/platformUi';
import { ResetDataSheet } from '../../components/settings/ResetDataSheet';
import { TestScenarioSheet, useSyncHeld } from '../../components/settings/TestScenarioSheet';
import { showsResetMyData } from '../../lib/testerReset';
import { useRevoAvailable } from '../../lib/revo/availability';
import { revoBackend } from '../../lib/revo/backend';
import { openRevo } from '../../lib/revo/open';
import { useRevoSettings } from '../../lib/revo/useRevoSettings';
import { showsTestScenarios } from '../../lib/testScenarios';
import { releaseSync } from '../../lib/offline/sync';

type NavigationProp = NativeStackNavigationProp<HomeStackParamList, 'Settings'>;


type IconName = keyof typeof Ionicons.glyphMap;

// ---------------------------------------------------------------------------
// Reusable bits — kept inline since they're tightly coupled to settings rows.
// ---------------------------------------------------------------------------

/** Each section's place in the list, by title, so Revo can open Settings at one (REVO-31). */
const SectionLayout = createContext<((title: string, y: number) => void) | null>(null);

/** The section titles Revo's openScreen names. */
const REVO_SECTION_TITLES: Record<RevoSettingsSection, readonly string[]> = {
  activity: ['Activity'],
  homeScreen: ['Home screen'],
  // Without prayer times the day boundary has its own section.
  prayer: ['Prayer', 'Day boundary'],
  revision: ['Revision'],
  revo: ['Revo AI'],
  mushaf: ['Mushaf'],
  notifications: ['Notifications'],
  appearance: ['Appearance'],
  testing: ['Testing'],
};

function Section({ title, footer, children }: { title?: string; footer?: string; children: React.ReactNode }) {
  const { palette } = useTheme();
  const onLayout = useContext(SectionLayout);
  // A flat list: a bold sentence-case header, rows on the ground, a hairline
  // closing the group.
  return (
    <View
      style={[v2.section, { borderBottomColor: palette.separator }]}
      onLayout={title && onLayout ? (e) => onLayout(title, e.nativeEvent.layout.y) : undefined}
    >
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
  subtitle,
  value,
  rightSlot,
  onPress,
  destructive,
  accessibilityState,
  testID,
}: {
  icon?: IconName;
  label: string;
  /** What it does, under the label. */
  subtitle?: string;
  value?: string;
  rightSlot?: React.ReactNode;
  onPress?: () => void;
  destructive?: boolean;
  accessibilityState?: AccessibilityState;
  testID?: string;
}) {
  const { palette } = useTheme();
  const row = (
    <View style={v2.row}>
      {icon ? <RowIcon name={icon} destructive={destructive} /> : null}
      {subtitle ? (
        <View style={[v2.rowLabel, !icon && v2.indent]}>
          <Text style={[typeV2.body, { color: destructive ? palette.red : palette.text }]}>{label}</Text>
          <Text style={[typeV2.meta, { color: palette.secondary }]}>{subtitle}</Text>
        </View>
      ) : (
        <Text
          style={[typeV2.body, v2.rowLabel, !icon && v2.indent, { color: destructive ? palette.red : palette.text }]}
        >
          {label}
        </Text>
      )}
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
      testID={testID}
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
  const route = useRoute<RouteProp<HomeStackParamList, 'Settings'>>();
  // Opened at a section (Revo's openScreen): scrolled to it once it has laid out.
  const scrollRef = useRef<ScrollView>(null);
  const sectionY = useRef(new Map<string, number>());
  const wantedSection = route.params?.section;
  const scrolledTo = useRef<string | null>(null);
  const scrollToWanted = useCallback(() => {
    if (!wantedSection || scrolledTo.current === wantedSection) return;
    const y = REVO_SECTION_TITLES[wantedSection]?.map((t) => sectionY.current.get(t)).find((v) => v != null);
    if (y == null) return;
    scrolledTo.current = wantedSection;
    scrollRef.current?.scrollTo({ y: Math.max(0, y - spacing.sm), animated: true });
  }, [wantedSection]);
  useEffect(() => {
    scrolledTo.current = null;
    scrollToWanted();
  }, [scrollToWanted]);
  const onSectionLayout = useCallback(
    (title: string, y: number) => {
      sectionY.current.set(title, y);
      scrollToWanted();
    },
    [scrollToWanted],
  );
  const { user, saveUser, resetOnboarding, pendingChanges = 0 } = useApp();
  const help = useHelpButtons();
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
  const [showNameModal, setShowNameModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [resetSheet, setResetSheet] = useState(false);
  const [scenarioSheet, setScenarioSheet] = useState(false);
  const syncHeld = useSyncHeld(firebaseUser?.uid);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [tempName, setTempName] = useState(user?.name ?? '');
  const nameInputRef = useRef<TextInput>(null);
  const homePrefs = useHomePrefs();
  // The speech model (hidden pages, word by word; testers): its size, its
  // download, Delete.
  // Revo (the accounts its release opens it to, REVO-37): on and off here; off deletes its history and memory.
  // An account with Revo on keeps the section while Revo is paused or no longer open to it, so it can
  // still turn Revo off and delete its conversations.
  const revoOpen = useRevoAvailable(user);
  const revoSettings = useRevoSettings(!!user);
  const revoShown = revoOpen || revoSettings?.optIn === true;
  const confirmRevoOff = () =>
    Alert.alert('Turn off Revo?', 'Your conversations with Revo and what it remembers are deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Turn off',
        style: 'destructive',
        onPress: () => {
          revoBackend()
            .setOptions({ optIn: false })
            .catch((err) => Alert.alert('Couldn’t turn off Revo', (err as Error)?.message ?? 'Try again.'));
        },
      },
    ]);
  const confirmRevoHistoryDelete = () =>
    Alert.alert('Delete your conversations?', 'Every conversation with Revo is deleted. What Revo remembers stays.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          revoBackend()
            .clear('history')
            .catch((err) => Alert.alert('Couldn’t delete them', (err as Error)?.message ?? 'Try again.'));
        },
      },
    ]);
  const speechModel = useSpeechModelState();
  const [speechSheet, setSpeechSheet] = useState(false);
  const [deleteSpeechOpen, setDeleteSpeechOpen] = useState(false);
  const mushaf = useMushafOffline();
  const mushafText = describeMushaf(mushaf);
  // At the accessibility text sizes the line under the label says it all; a
  // value beside it would leave the label a word wide.
  const { fontScale } = useWindowDimensions();
  const [mushafMenu, setMushafMenu] = useState(false);
  const [mushafPicker, setMushafPicker] = useState(false);
  const edition = useMushafEdition();
  // Prayer (testers): the section, the Prayer sheet, the Home line's switch.
  const prayerEnabled = prayerTimesEnabled(user);
  const prayerPrefs = usePrayerPrefs();
  const prayerTimes = usePrayerTimes(user);
  const [prayerSheet, setPrayerSheet] = useState<PrayerTab | null>(null);
  const prayerOn = PRAYERS.filter((p) => prayerPrefs.alerts[p].on).length;
  const qiblaValue = prayerTimes.place
    ? [formatBearing(qiblaBearing(prayerTimes.place)), nearestCity(prayerTimes.place, bundledCities())?.name]
        .filter(Boolean)
        .join(' · ')
    : undefined;
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
      <TopSafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={[typography.bodyMedium, { color: theme.textSecondary }]}>Loading…</Text>
        </View>
      </TopSafeAreaView>
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

  const handleSignOut = () => {
    // Changes made offline and not yet sent wait on this phone for this
    // account's next sign-in here (lib/offline).
    Alert.alert(
      'Sign out?',
      pendingChanges > 0
        ? "Some changes haven't synced yet. They'll sync the next time you sign in to this account on this phone."
        : 'Your local data will be preserved.',
      [
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
      ],
    );
  };

  // Delete account always ends (ACCOUNT-3): deleted, or an error with Try again.
  const runDeleteAccount = async () => {
    try {
      await deleteAccount();
      Alert.alert('Account deleted', 'Your account and data have been removed.');
    } catch (err: any) {
      Alert.alert(
        'Could not delete account',
        err?.message ?? 'Please try again. If the issue persists, contact support.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Try again', style: 'destructive', onPress: () => void runDeleteAccount() },
        ],
      );
    }
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
                { text: 'I understand, delete', style: 'destructive', onPress: () => void runDeleteAccount() },
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

  return (
    <TopSafeAreaView style={styles.container}>
      <TopBar title="Settings" onBack={() => navigation.goBack()} separator />

      <SectionLayout.Provider value={onSectionLayout}>
      <ScrollView ref={scrollRef} contentInsetAdjustmentBehavior="never" contentContainerStyle={[v2.content, { paddingBottom: tabFootprint + spacing.lg }]} testID="settings-scroll">
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
          {prayerEnabled ? (
            <Row
              icon="time-outline"
              label="Next prayer"
              subtitle="A line under the header"
              rightSlot={
                <SettingSwitch value={prayerPrefs.homeLine} onValueChange={(v) => setPrayerPrefs({ homeLine: v })} />
              }
            />
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

        {prayerEnabled ? (
          <Section title="Prayer">
            <Row
              icon="time-outline"
              label="Prayer times"
              value={
                prayerTimes.next
                  ? `${TIME_LABELS[prayerTimes.next.name].en} ${formatPrayerTime(prayerTimes.next.time)}`
                  : undefined
              }
              onPress={() => setPrayerSheet('times')}
            />
            <Row
              icon="notifications-outline"
              label="Prayer notifications"
              value={prayerOn > 0 ? `${prayerOn} on` : 'Off'}
              onPress={() => navigation.navigate('PrayerNotifications')}
            />
            <Row
              icon="options-outline"
              label="Calculation"
              value={methodLabel(prayerTimes.settings.method, true)}
              onPress={() => navigation.navigate('PrayerCalculation')}
            />
            <Row icon="compass-outline" label="Qibla" value={qiblaValue} onPress={() => setPrayerSheet('qibla')} />
            <FajrBoundaryCard compact />
          </Section>
        ) : (
          <Section title="Day boundary">
            <FajrBoundaryCard />
          </Section>
        )}

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
              testID="smart-tracking-switch"
            />
          </View>
          <CarryOverSetting
            mode={localUser.carryOverMode}
            onChange={(carryOverMode) => updateUser({ carryOverMode })}
          />
          {reciteModeEnabled(user) && canFollowWords() ? (
            <Row
              icon="mic-outline"
              label="Speech model"
              subtitle="Follows your recitation word by word, on this iPhone"
              value={
                speechModel.status === 'ready'
                  ? formatModelSize(speechModel.bytes)
                  : speechModel.status === 'downloading'
                    ? `${Math.round(speechModel.progress * 100)}%`
                    : 'Not downloaded'
              }
              onPress={() => (speechModel.status === 'ready' ? setDeleteSpeechOpen(true) : setSpeechSheet(true))}
            />
          ) : null}

        </Section>

        {revoShown && (
          <Section title="Revo AI" footer="Revo AI can make mistakes. It answers from your own revision data.">
            <View style={v2.iconRow} testID="revo-settings-row">
              <SettingIcon name="sparkles-outline" />
              <View style={v2.iconRowText}>
                <Text style={[typeV2.body, { color: palette.text }]}>Revo</Text>
                <Text style={[typeV2.meta, { color: palette.secondary }]}>
                  {!revoOpen ? 'Paused for now' : revoSettings?.optIn ? 'Your revision coach, from the button on Home' : 'Off. Turn on to ask about your revision'}
                </Text>
              </View>
              <SettingSwitch
                value={revoSettings?.optIn === true}
                onValueChange={(v) => (v ? openRevo({ view: 'optin' }) : confirmRevoOff())}
                accessibilityLabel="Revo"
                testID="revo-settings-switch"
              />
            </View>
            {revoSettings?.optIn ? (
              <>
                {revoOpen ? (
                  <Row icon="bulb-outline" label="Memory" value={revoSettings.memoryOn ? 'On' : 'Off'} onPress={() => openRevo({ view: 'memory' })} />
                ) : null}
                <Row icon="trash-outline" label="Delete conversations" destructive onPress={confirmRevoHistoryDelete} />
              </>
            ) : null}
          </Section>
        )}

        <Section title="Mushaf">
          <View testID="mushaf-edition-row">
            <Row
              icon="book-outline"
              label="Mushaf"
              value={mushafEdition(edition).name}
              onPress={() => setMushafPicker(true)}
            />
          </View>
          <View testID="mushaf-offline-row">
            <Row
              icon="cloud-download-outline"
              label="Offline mushaf"
              subtitle={mushafText.subtitle}
              value={fontScale > 1.35 ? undefined : mushafText.value || undefined}
              onPress={() => setMushafMenu(true)}
            />
          </View>
          <Row
            icon="cellular-outline"
            label="Download over mobile data"
            rightSlot={
              <SettingSwitch
                value={mushaf.prefs.cellular}
                onValueChange={(v) => void setMushafCellular(v)}
                accessibilityLabel="Download the mushaf over mobile data"
              />
            }
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
          {/* Like Theme: the label on the left, the choices on the right.
              Kept with the account (DesignGate brings it to other devices). */}
          <View style={v2.iconRow} testID="accent-row">
            <SettingIcon name="color-filter-outline" />
            <AccentSetting
              value={design.accent}
              onChange={(accent) => {
                design.setAccent(accent);
                updateUser({ accent });
              }}
            />
          </View>
        </Section>

        <Section title="Support">
          {help.available ? (
            <Row
              icon={HELP_ICON}
              label="Help buttons"
              subtitle="A ? on screens that need explaining"
              rightSlot={
                <SettingSwitch
                  value={help.shown}
                  onValueChange={help.setShown}
                  accessibilityLabel="Help buttons on screens"
                  testID="settings-help-buttons"
                />
              }
            />
          ) : null}
          <Row
            icon={shareIcon}
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
          <AppInfo tools={showsUpdateTools(user)} />
        </Section>

        {firebaseUser && showsResetMyData(user) && (
          <Section title="Testing">
            <View testID="reset-data-row">
              <Row
                icon="refresh-outline"
                label="Reset my data"
                subtitle="Start again as a new account"
                destructive
                onPress={() => setResetSheet(true)}
                testID="settings-reset-data"
              />
            </View>
            {showsTestScenarios(user) && (
              <View testID="test-scenario-row">
                <Row
                  icon="flask-outline"
                  label="Load test scenario"
                  subtitle="Replace your data with a ready-made situation"
                  destructive
                  onPress={() => setScenarioSheet(true)}
                  testID="settings-test-scenario"
                />
              </View>
            )}
            {syncHeld && (
              <View testID="held-changes-row">
                <Row
                  icon="cloud-upload-outline"
                  label="Send held changes"
                  subtitle="The test scenario's changes wait on this phone until now"
                  onPress={() => firebaseUser && releaseSync(firebaseUser.uid)}
                />
              </View>
            )}
          </Section>
        )}

        {firebaseUser && (
          <Section>
            <Row
              icon="log-out-outline"
              label="Sign out"
              onPress={handleSignOut}
              testID="settings-sign-out"
            />
            <Row
              icon="trash-outline"
              label="Delete account"
              destructive
              onPress={handleDeleteAccount}
              testID="settings-delete-account"
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
      </SectionLayout.Provider>
      <SpeechModelSheet visible={speechSheet} onClose={() => setSpeechSheet(false)} onReady={() => setSpeechSheet(false)} />
      <ActionSheet
        visible={deleteSpeechOpen}
        onClose={() => setDeleteSpeechOpen(false)}
        title="Speech model"
        message={`${formatModelSize()} on this iPhone. It downloads again the next time you follow word by word.`}
        actions={[{ key: 'delete', label: 'Delete speech model', icon: 'trash-outline', destructive: true, onPress: removeSpeechModel }]}
        testID="speech-model-delete-menu"
      />
      <MushafPickerSheet visible={mushafPicker} onClose={() => setMushafPicker(false)} />
      {showsResetMyData(user) ? <ResetDataSheet visible={resetSheet} onClose={() => setResetSheet(false)} /> : null}
      {showsTestScenarios(user) ? (
        <TestScenarioSheet visible={scenarioSheet} onClose={() => setScenarioSheet(false)} />
      ) : null}
      <ActionSheet
        visible={mushafMenu}
        onClose={() => setMushafMenu(false)}
        title="Offline mushaf"
        message={mushafText.subtitle}
        messageMaxScale={1.4}
        actions={mushafMenuActions(mushaf)}
        testID="mushaf-offline-menu"
      />
      {prayerEnabled ? (
        <PrayerSheet
          visible={prayerSheet != null}
          tab={prayerSheet ?? 'times'}
          onTab={setPrayerSheet}
          onClose={() => setPrayerSheet(null)}
          onOpenCalculation={() => {
            setPrayerSheet(null);
            navigation.navigate('PrayerCalculation');
          }}
        />
      ) : null}

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
    </TopSafeAreaView>
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
});

