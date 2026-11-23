import React, { useRef, useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
  Share,
  TextInput,
  AccessibilityState,
  Modal,
  useWindowDimensions,
  Linking,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import { TopSafeAreaView } from '../../components/SafeAreaView';
import Constants from 'expo-constants';
import { AppInfo } from '../../components/settings/AppInfo';
import { useDesign } from '../../design/DesignContext';
import { ACCENT_LABELS, layoutV2, radiusV2, typeV2 } from '../../theme/v2';
import { AccentSetting } from '../../components/settings/AccentPicker';
import { TopBar } from '../../components/v2/TopBar';
import { Mark } from '../../components/v2/Mark';
import { PillButton } from '../../components/v2/PillButton';
import { Tap } from '../../components/v2/Tap';
import { Sheet } from '../../components/v2/Sheet';
import { openReportProblem } from '../../lib/report/state';
import { shareRevisely } from '../../lib/shareApp';
import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { FajrBoundaryCard } from '../../components/FajrBoundaryCard';
import { SpeechModelSheet } from '../../components/recite/SpeechModelSheet';
import { ActionSheet } from '../../components/v2/ActionSheet';
import { voiceSearchEnabled } from '../../lib/search/availability';
import { formatModelSize } from '../../lib/recite/speechModel';
import { removeSpeechModel, useSpeechModelState } from '../../lib/recite/speechModelStore';
import { PrayerSheet, PrayerTab } from '../../components/prayer/PrayerSheet';
import { usePrayerTimes } from '../../components/prayer/usePrayerTimes';
import { prayerTimesEnabled } from '../../lib/prayer/status';
import { PRAYERS, setPrayerPrefs, usePrayerPrefs } from '../../lib/prayer/prefs';
import { athanEnabled } from '../../lib/athan';
import { useChosenAthanVoice } from '../../components/prayer/useChosenAthanVoice';
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
import type { HomeStackParamList } from '../../navigation/MainNavigator';
import { pageOfSection, remindersSummary, type SettingsPage } from '../../lib/settingsPages';
import * as firestoreService from '../../services/firestoreService';
import { getTotalAppUsageSeconds } from '../../lib/appUsage';
import { formatDuration } from '../../lib/readingTimer';
import { avatarInitial } from '../../lib/displayName';
import { deleteAllRecordings, listRecordings } from '../../lib/recordings';
import { askTurnOffBackup, backupLabel, deleteAllEverywhere, useBackupStatus } from '../../lib/recordingBackupUi';
import { formatBytes } from '../../lib/recordingFormat';
import { logger } from '../../lib/logger';
import { setHomePrefs, useHomePrefs } from '../../lib/homePrefs';
import { SUPPORT_EMAIL, supportMailto } from '../../lib/contact';
import { openRatingPage, rateAskEnabled } from '../../lib/rateAsk';
import { openEmail, openWebPage } from '../../lib/openWebPage';
import { PillTabs } from '../../components/v2/PillTabs';
import { setMushafCellular } from '../../lib/mushafOffline';
import { describeMushaf, mushafMenuActions, useMushafOffline } from '../../lib/mushafOfflineUi';
import { mushafEdition, useMushafEdition } from '../../lib/mushafEdition';
import { MushafPickerSheet } from '../../components/mushaf/MushafPickerSheet';
import { shareIcon } from '../../lib/platformUi';
import { ResetDataSheet } from '../../components/settings/ResetDataSheet';
import { LicencesSheet } from '../../components/settings/LicencesSheet';
import { showsModelLicense } from '../../lib/release/modelLicense';
import { TestScenarioSheet, useSyncHeld } from '../../components/settings/TestScenarioSheet';
import { showsResetMyData } from '../../lib/testerReset';
import { replayOffered } from '../../lib/whatsNew/due';
import { setForcedAtLaunch, useWhatsNewSaved } from '../../lib/whatsNew/state';
import { WhatsNewReplay } from '../../components/whatsNew/WhatsNewReplay';
import { useRevoAvailable } from '../../lib/revo/availability';
import { revoBackend } from '../../lib/revo/backend';
import { openRevo } from '../../lib/revo/open';
import { useRevoSettings } from '../../lib/revo/useRevoSettings';
import { markRevoMomentSeen } from '../../lib/revo/momentSeen';
import { RevoMoment } from '../../components/whatsNew/RevoMoment';
import { auth } from '../../lib/firebase';
import { greetingName } from '../../lib/displayName';
import { smartTrackingOn } from '../../lib/smartTracking';
import { showsTestScenarios } from '../../lib/testScenarios';
import { releaseSync } from '../../lib/offline/sync';
import { reciteLiveForAccount } from '../../lib/reciteLive/availability';
import { premiumErrorText, setDevPremium, usePremium } from '../../lib/premium';
import { earlyAccessLine, useEarlyAccess } from '../../lib/earlyAccess';
import { checkLevel, setReciteCheckSettings, strictOffered, useReciteCheckSettings } from '../../lib/reciteCheck/settings';
import { ReciteCheckNotice } from '../../components/reciteCheck/ReciteCheckNotice';
import { currentLanguage, t, formatNumber } from '../../i18n';
import {
  chooseLanguage,
  languageChoice,
  languagePickerOffered,
  offeredLanguages,
  resolveChoice,
  restartForLanguage,
  type LanguageChoice,
} from '../../i18n/choice';
import { LANGUAGE_NAMES } from '../../i18n/language';
import { isDevVariant } from '../../lib/variant';
import { ramadanThemeOffered, setRamadanTheme, useRamadanThemeSaved } from '../../lib/ramadanTheme';
import { activityTabOffered, activityTabOn, setActivityTab, useActivityTabSaved } from '../../lib/activityTab';
import { CheckerModelRow } from '../../components/settings/CheckerModelRow';
import { ScheduledRemindersRow } from '../../components/settings/ScheduledRemindersRow';
import { useNotificationPermission } from '../../hooks/useNotificationPermission';
import { ensureNotificationsPermission } from '../../lib/notifications';
import { remindersWhileAwayEnabled } from '../../lib/release/remindersWhileAway';
import { forwardIcon } from '../../i18n/direction';

type NavigationProp = NativeStackNavigationProp<HomeStackParamList, 'Settings'>;


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
      {onPress && !rightSlot && <Ionicons name={forwardIcon()} size={16} color={palette.secondary} />}
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
          accessibilityLabel={opt.value === value ? t('settings.selected', { label: opt.label }) : opt.label}
        />
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

/** Settings → Prayer → Athan voice: its own component, so the catalog is read only where it shows. */
function AthanVoiceRow({ onPress }: { onPress: () => void }) {
  const voice = useChosenAthanVoice();
  return (
    <Row
      icon="volume-high-outline"
      label={t('settings.prayer.athanVoice')}
      value={voice?.name ?? t('prayer.athan.none')}
      onPress={onPress}
    />
  );
}

export default function SettingsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProp<HomeStackParamList, 'Settings'>>();
  const { user, saveUser, resetOnboarding, pendingChanges = 0 } = useApp();
  const help = useHelpButtons();
  const { firebaseUser, signOutUser, deleteAccount } = useAuth();
  const { theme, palette, themeMode, setThemeMode } = useTheme();
  const design = useDesign();
  const ramadanTheme = useRamadanThemeSaved();
  const activityTab = useActivityTabSaved();
  // Activity: its own tab while it is one (Revisely Dev's switch, TAB-2), else pushed here as before.
  const openActivity = () => {
    if (activityTabOn()) navigation.getParent()?.navigate('ActivityTab', { screen: 'Activity' });
    else navigation.navigate('Activity');
  };
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
  // The recitation check (Revisely Dev, testers): its AI notice stays reachable from About.
  const reciteCheck = reciteLiveForAccount(user);
  const reciteCheckSettings = useReciteCheckSettings(reciteCheck ? user?.id : null);
  const [checkLevelSheet, setCheckLevelSheet] = useState(false);
  // About → Licences (SET-5): the recitation model's licence in full, once the model runs on the phone.
  const [licences, setLicences] = useState(false);
  // Revisely Dev: Settings → Appearance → Language (src/i18n/choice.ts).
  const [languageSheet, setLanguageSheet] = useState(false);
  const [chosenLanguage, setChosenLanguage] = useState<LanguageChoice>(languageChoice);
  const pickLanguage = (next: LanguageChoice) => {
    setChosenLanguage(next);
    void chooseLanguage(next).then((language) => {
      if (language === currentLanguage()) return;
      // Kept either way: Not now shows it from the next launch.
      Alert.alert(
        t('settings.language.restartTitle'),
        t('settings.language.restartBody', { language: LANGUAGE_NAMES[language] }),
        [
          { text: t('common.notNow'), style: 'cancel' },
          { text: t('settings.language.restart'), onPress: () => void restartForLanguage() },
        ],
      );
    });
  };
  // Premium (lib/premium): in Revisely Dev a tester turns it on and off here, free, to see marking mistakes locked.
  const premium = usePremium(user?.id, reciteCheck);
  // Premium early access (lib/earlyAccess, PREM-1): the Recite section's Premium row says it's free now and kept for life.
  const earlyAccessOn = useEarlyAccess();
  const [premiumBusy, setPremiumBusy] = useState(false);
  const switchPremium = useCallback((on: boolean) => {
    setPremiumBusy(true);
    setDevPremium(on)
      .catch((err) => Alert.alert(on ? t('settings.testing.premiumOnFailed') : t('settings.testing.premiumOffFailed'), premiumErrorText(err)))
      .finally(() => setPremiumBusy(false));
  }, []);
  const [reciteNotice, setReciteNotice] = useState(false);
  const [scenarioSheet, setScenarioSheet] = useState(false);
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  // Show What's new at launch (testers): kept on the phone, from the next launch.
  const whatsNewSaved = useWhatsNewSaved(showsResetMyData(user) ? firebaseUser?.uid : null);
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
  // Settings → Revo AI → What Revo can do: Revo's moment again, any time (REVO-39).
  const [revoMoment, setRevoMoment] = useState(false);
  const confirmRevoOff = () =>
    Alert.alert(t('settings.revo.offTitle'), t('settings.revo.offBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.revo.turnOff'),
        style: 'destructive',
        onPress: () => {
          revoBackend()
            .setOptions({ optIn: false })
            .catch((err) => Alert.alert(t('settings.revo.offFailed'), (err as Error)?.message ?? t('common.tryAgainSentence')));
        },
      },
    ]);
  const confirmRevoHistoryDelete = () =>
    Alert.alert(t('settings.revo.deleteTitle'), t('settings.revo.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          revoBackend()
            .clear('history')
            .catch((err) => Alert.alert(t('settings.revo.deleteFailed'), (err as Error)?.message ?? t('common.tryAgainSentence')));
        },
      },
    ]);
  const speechModel = useSpeechModelState();
  // The speech model searches by voice (everyone, on an iPhone) and follows recitation (testers).
  const speechModelShown = voiceSearchEnabled(user);
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

  // Every hook comes before the loading return below: one after it threw "Rendered more hooks than during the
  // previous render" when Settings rendered before the account had loaded (Nov 2026).
  const backupStatus = useBackupStatus();

  // REMIND-5 (with the reminders-while-away switch): the switch shows on only while reminders can come. With the
  // phone refusing notifications it shows off and says so, and turning it on offers the phone's Settings (iOS won't
  // ask twice), never a switch that does nothing.
  const refusalShown = remindersWhileAwayEnabled();
  const { permission: notifyPermission, refresh: refreshNotifyPermission } = useNotificationPermission(refusalShown);
  const notificationsRefused = refusalShown && notifyPermission?.status === 'denied';
  const [refusedSheet, setRefusedSheet] = useState(false);

  if (!localUser) {
    return (
      <TopSafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={[typography.bodyMedium, { color: theme.textSecondary }]}>{t('common.loading')}</Text>
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
      await Share.share(shareRevisely(t('settings.support.shareMessage'), Platform.OS));
    } catch {
      // User dismissed the sheet or platform refused — nothing to do.
    }
  };

  // REMIND-5: turned on while the phone refuses, the phone's Settings are offered; not asked yet, it asks.
  const handleNotificationToggle = async (enabled: boolean) => {
    if (enabled && refusalShown) {
      const p = await Notifications.getPermissionsAsync().catch(() => null);
      if (p && p.status !== 'granted') {
        if (p.canAskAgain === false) {
          setRefusedSheet(true);
          return;
        }
        // Not asked yet (or Android may ask again): asked now; a no leaves reminders off.
        const granted = await ensureNotificationsPermission().catch(() => false);
        refreshNotifyPermission();
        if (!granted) return;
      }
    }
    await updateUser({ notificationsEnabled: enabled });
  };

  const handleSaveName = async () => {
    const trimmed = tempName.trim();
    await updateUser({ name: trimmed.length > 0 ? trimmed : undefined });
    setShowNameModal(false);
  };

  // Recording backup (lib/recordingBackup): on by default.
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
      Alert.alert(t('settings.support.thanks'), t('settings.support.thanksBody'));
    } catch (err) {
      Alert.alert(
        t('settings.support.feedbackFailed'),
        err instanceof Error ? err.message : t('settings.support.feedbackFailedBody'),
      );
    } finally {
      setFeedbackSubmitting(false);
    }
  };

  const handleSignOut = () => {
    // Changes made offline and not yet sent wait on this phone for this
    // account's next sign-in here (lib/offline).
    Alert.alert(
      t('settings.account.signOutTitle'),
      pendingChanges > 0 ? t('settings.account.signOutPending') : t('settings.account.signOutBody'),
      [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.signOut'),
        onPress: async () => {
          try {
            await signOutUser();
          } catch {
            Alert.alert(t('common.error'), t('settings.account.signOutFailed'));
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
      Alert.alert(t('settings.account.deleted'), t('settings.account.deletedBody'));
    } catch (err: any) {
      Alert.alert(
        t('settings.account.deleteFailed'),
        err?.message ?? t('settings.account.deleteFailedBody'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('common.tryAgain'), style: 'destructive', onPress: () => void runDeleteAccount() },
        ],
      );
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      t('settings.account.deleteTitle'),
      t('settings.account.deleteBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            // Second confirmation — Apple wants this kind of friction.
            Alert.alert(
              t('settings.account.sureTitle'),
              t('settings.account.sureBody'),
              [
                { text: t('common.cancel'), style: 'cancel' },
                { text: t('settings.account.sureConfirm'), style: 'destructive', onPress: () => void runDeleteAccount() },
              ],
            );
          },
        },
      ],
    );
  };

  const handleReplayOnboarding = () => {
    Alert.alert(
      t('settings.dev.replayTitle'),
      t('settings.dev.replayBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.dev.replayConfirm'),
          onPress: async () => {
            try {
              await resetOnboarding();
            } catch {
              Alert.alert(t('common.error'), t('settings.dev.replayFailed'));
            }
          },
        },
      ],
    );
  };

  // ---------------------------------------------------------------------------
  // Pages (SET-1): the first level, or the page `page` names (pushed again with it, so Back returns to the first level).
  // A Settings section (Revo's openScreen, Insights' Turn on Smart Tracking) opens the page that holds its rows.
  // ---------------------------------------------------------------------------
  const page: SettingsPage | null =
    route.params?.page ?? (route.params?.section ? pageOfSection(route.params.section, prayerEnabled) : null);
  const openPage = (next: SettingsPage) => navigation.push('Settings', { page: next });
  const pageTitle = (p: SettingsPage) =>
    p === 'mushaf' ? (reciteCheck ? t('settings.sections.mushafRecite') : t('settings.sections.mushaf')) : t(`settings.sections.${p}`);
  // What each page is set to, beside its name on the first level.
  const remindersOn = localUser.notificationsEnabled && !notificationsRefused;
  const prayerCity = prayerTimes.place ? nearestCity(prayerTimes.place, bundledCities())?.name : undefined;
  const prayerValue = [methodLabel(prayerTimes.settings.method, true), prayerCity].filter(Boolean).join(' · '); // i18n-ignore (a list's separator)
  // On this phone: the offline mushaf, the recordings and the speech model.
  const storedBytes =
    (mushaf.bytes ?? 0) + (recordings?.bytes ?? 0) + (speechModelShown && speechModel.status === 'ready' ? speechModel.bytes : 0);
  const storageValue = storedBytes > 0 ? formatBytes(storedBytes) : undefined;
  const themeLabel =
    themeMode === 'system' ? t('settings.appearance.system') : themeMode === 'dark' ? t('settings.appearance.dark') : t('settings.appearance.light');
  const appearanceValue = `${themeLabel} · ${ACCENT_LABELS[design.accent]}`; // i18n-ignore (a list's separator)
  // Your account at the top of the first level (it opens the Account page) and of the Account page.
  const premiumLine = reciteCheck && premium.has ? (earlyAccessOn ? t('settings.root.premiumEarly') : t('settings.root.premium')) : null;
  const accountWho = [localUser.name?.trim(), firebaseUser?.email, premiumLine].filter(Boolean).join(', '); // i18n-ignore (a list for VoiceOver)
  const accountHeader = (opens: boolean) => (
    <View style={[v2.profileRow, { borderBottomColor: palette.separator }]} testID={opens ? undefined : 'settings-account-header'}>
      <Mark label={avatarInitial(localUser.name, firebaseUser?.email)} />
      <View style={{ flex: 1, minWidth: 0, marginLeft: layoutV2.markGap }}>
        {/* Long names wrap to a second line before shrinking or cutting. */}
        {localUser.name?.trim() ? (
          <Text style={[typeV2.name, { color: theme.textPrimary }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>
            {localUser.name.trim()}
          </Text>
        ) : null}
        <Text style={[typeV2.meta, { color: theme.textSecondary }]} numberOfLines={1} ellipsizeMode="middle">
          {firebaseUser?.email}
        </Text>
        {premiumLine ? (
          <Text style={[typeV2.meta, { color: palette.accentText }]} testID="settings-account-premium">
            {premiumLine}
          </Text>
        ) : null}
      </View>
      {opens ? <Ionicons name={forwardIcon()} size={16} color={palette.secondary} /> : null}
    </View>
  );

  return (
    <TopSafeAreaView style={styles.container}>
      <TopBar title={page ? pageTitle(page) : t('settings.title')} onBack={() => navigation.goBack()} separator />

      <ScrollView contentInsetAdjustmentBehavior="never" contentContainerStyle={[v2.content, { paddingBottom: tabFootprint + spacing.lg }]} testID={page ? `settings-${page}-scroll` : 'settings-scroll'}>
        {page == null ? (
          <>
            {firebaseUser ? (
              <Tap
                onPress={() => openPage('account')}
                accessibilityRole="button"
                accessibilityLabel={t('settings.root.accountLabel', { who: accountWho })}
                testID="settings-account"
              >
                {accountHeader(true)}
              </Tap>
            ) : null}
            <Section>
              <Row icon="analytics-outline" label={t('settings.sections.revision')} value={localUser.smartTrackingEnabled ? t('settings.root.smartOn') : t('settings.root.smartOff')} onPress={() => openPage('revision')} testID="settings-page-revision" />
              <Row icon="alarm-outline" label={t('settings.sections.reminders')} value={remindersSummary(remindersOn, prayerEnabled ? prayerOn : 0)} onPress={() => openPage('reminders')} testID="settings-page-reminders" />
              {prayerEnabled ? (
                <Row icon="time-outline" label={t('settings.sections.prayer')} value={prayerValue} onPress={() => openPage('prayer')} testID="settings-page-prayer" />
              ) : null}
              <Row icon="book-outline" label={pageTitle('mushaf')} value={mushafEdition(edition).name} onPress={() => openPage('mushaf')} testID="settings-page-mushaf" />
              {revoShown ? (
                <Row icon="sparkles-outline" label={t('settings.sections.revo')} value={!revoOpen ? t('settings.revo.paused') : revoSettings?.optIn ? t('settings.on') : t('settings.off')} onPress={() => openPage('revo')} testID="settings-page-revo" />
              ) : null}
              <Row icon="cloud-download-outline" label={t('settings.sections.storage')} value={storageValue} onPress={() => openPage('storage')} testID="settings-page-storage" />
              <Row icon="color-palette-outline" label={t('settings.sections.appearance')} value={appearanceValue} onPress={() => openPage('appearance')} testID="settings-page-appearance" />
            </Section>
            <Section>
              <Row icon={HELP_ICON} label={t('settings.sections.help')} onPress={() => openPage('help')} testID="settings-page-help" />
              <Row icon="information-circle-outline" label={t('settings.sections.about')} onPress={() => openPage('about')} testID="settings-page-about" />
              {firebaseUser && showsResetMyData(user) ? (
                <Row icon="flask-outline" label={t('settings.sections.testing')} onPress={() => openPage('testing')} testID="settings-page-testing" />
              ) : null}
            </Section>
            <Text style={[typeV2.meta, v2.version, { color: palette.secondary }]} maxFontSizeMultiplier={1.4}>
              {t('settings.about.version', { version: Constants.expoConfig?.version ?? '1.0.0' })}
            </Text>
            {__DEV__ && (
              <Section title={t('settings.sections.dev')}>
                <Row
                  icon="refresh-outline"
                  label={t('settings.dev.replay')}
                  onPress={handleReplayOnboarding}
                />
              </Section>
            )}
          </>
        ) : null}
        {page === 'account' && firebaseUser ? (
          <>
            {accountHeader(false)}
            <Section>
              <Row
                icon="person-outline"
                label={t('settings.account.displayName')}
                value={localUser.name ?? t('settings.account.notSet')}
                onPress={() => {
                  setTempName(localUser.name ?? '');
                  setShowNameModal(true);
                }}
              />
              {reciteCheck && premium.has ? (
                <Row
                  icon="sparkles-outline"
                  label={t('settings.recite.premium')}
                  subtitle={earlyAccessLine(premium, earlyAccessOn) ?? t('settings.recite.premiumSub')}
                  testID="settings-premium-row"
                />
              ) : null}
              <Row
                icon="hourglass-outline"
                label={t('settings.activity.timeInApp')}
                value={appSeconds != null ? formatDuration(appSeconds) : '—'}
              />
            </Section>
            <Section>
              <Row
                icon="log-out-outline"
                label={t('common.signOut')}
                onPress={handleSignOut}
                testID="settings-sign-out"
              />
              <Row
                icon="trash-outline"
                label={t('settings.account.deleteAccount')}
                destructive
                onPress={handleDeleteAccount}
                testID="settings-delete-account"
              />
            </Section>
          </>
        ) : null}
        {page === 'revision' ? (
          <Section>
            <View style={v2.iconRow} testID="smart-tracking-row">
              <SettingIcon name="analytics-outline" />
              <View style={v2.iconRowText}>
                <Text style={[typeV2.body, { color: palette.text }]}>{t('settings.revision.smartTracking')}</Text>
                {!localUser.smartTrackingEnabled && (
                  <Text style={[typeV2.meta, { color: palette.secondary }]}>
                    {t('settings.revision.smartTrackingOff')}
                  </Text>
                )}
              </View>
              <SettingSwitch
                value={localUser.smartTrackingEnabled}
                onValueChange={(v) => updateUser({ smartTrackingEnabled: v })}
                accessibilityLabel={t('settings.revision.smartTracking')}
                testID="smart-tracking-switch"
              />
            </View>
            <CarryOverSetting
              mode={localUser.carryOverMode}
              onChange={(carryOverMode) => updateUser({ carryOverMode })}
            />
            {/* When the revision day starts. With prayer times its method is Prayer's Calculation, so the switch alone. */}
            <FajrBoundaryCard compact={prayerEnabled} />
            <Row
              icon="book-outline"
              label={t('settings.activity.memorizedPages')}
              onPress={() => navigation.navigate('Memorization')}
            />
            <Row
              icon="pulse-outline"
              label={t('settings.activity.activity')}
              value={readingSeconds != null ? t('settings.activity.timed', { duration: formatDuration(readingSeconds) }) : undefined}
              onPress={openActivity}
            />
          </Section>
        ) : null}
        {page === 'reminders' ? (
          <Section>
            <Row
              icon="alarm-outline"
              label={t('settings.notifications.enable')}
              subtitle={notificationsRefused && localUser.notificationsEnabled ? t('settings.notifications.refused') : undefined}
              rightSlot={
                <SettingSwitch
                  value={localUser.notificationsEnabled && !notificationsRefused}
                  onValueChange={handleNotificationToggle}
                  accessibilityLabel={t('settings.notifications.enable')}
                  testID="settings-notifications"
                />
              }
            />
            {prayerEnabled ? (
              <Row
                icon="notifications-outline"
                label={t('settings.prayer.notifications')}
                value={prayerOn > 0 ? t('settings.prayer.nOn', { count: prayerOn }) : t('settings.off')}
                onPress={() => navigation.navigate('PrayerNotifications')}
              />
            ) : null}
            <Row
              icon="book-outline"
              label={t('settings.homeScreen.fridayKahf')}
              subtitle={t('settings.homeScreen.fridayKahfSub')}
              rightSlot={
                <SettingSwitch
                  value={homePrefs.fridayKahfReminder}
                  onValueChange={(v) => setHomePrefs({ fridayKahfReminder: v })}
                />
              }
            />
          </Section>
        ) : null}
        {page === 'prayer' && prayerEnabled ? (
          <Section>
            <Row
              icon="time-outline"
              label={t('settings.prayer.times')}
              value={
                prayerTimes.next
                  ? `${TIME_LABELS[prayerTimes.next.name].en} ${formatPrayerTime(prayerTimes.next.time)}`
                  : undefined
              }
              onPress={() => setPrayerSheet('times')}
            />
            {athanEnabled() ? <AthanVoiceRow onPress={() => navigation.navigate('AthanVoice')} /> : null}
            <Row
              icon="options-outline"
              label={t('settings.prayer.calculation')}
              value={methodLabel(prayerTimes.settings.method, true)}
              onPress={() => navigation.navigate('PrayerCalculation')}
            />
            <Row icon="compass-outline" label={t('settings.prayer.qibla')} value={qiblaValue} onPress={() => setPrayerSheet('qibla')} />
            <Row
              icon="home-outline"
              label={t('settings.homeScreen.nextPrayer')}
              rightSlot={
                <SettingSwitch value={prayerPrefs.homeLine} onValueChange={(v) => setPrayerPrefs({ homeLine: v })} />
              }
            />
          </Section>
        ) : null}
        {page === 'mushaf' ? (
          <Section footer={reciteCheck ? t('settings.recite.footer') : undefined}>
            <View testID="mushaf-edition-row">
              <Row
                icon="book-outline"
                label={t('settings.mushafRows.mushaf')}
                value={mushafEdition(edition).name}
                onPress={() => setMushafPicker(true)}
              />
            </View>
            {reciteCheck ? (
              <>
                {/* Mistakes to mark: a choice only where Strict is offered (Revisely Dev, until its own switch is on). */}
                {strictOffered() ? (
                  <Row
                    icon="checkmark-done-outline"
                    label={t('settings.recite.level')}
                    value={checkLevel(reciteCheckSettings) === 'strict' ? t('settings.recite.strict') : t('settings.recite.words')}
                    onPress={() => setCheckLevelSheet(true)}
                    testID="settings-check-level"
                  />
                ) : null}
                {checkLevel(reciteCheckSettings) === 'strict' ? (
                  <>
                    <Row
                      label={t('settings.recite.munfasil')}
                      rightSlot={
                        <PillTabs
                          compact
                          hug
                          tone="ink"
                          options={[2, 4, 5].map((n) => ({ value: String(n), label: String(n) }))}
                          value={String(reciteCheckSettings.munfasil)}
                          onChange={(v) => setReciteCheckSettings(user?.id, { munfasil: Number(v) as 2 | 4 | 5 })}
                        />
                      }
                    />
                    <Row
                      label={t('settings.recite.muttasil')}
                      rightSlot={
                        <PillTabs
                          compact
                          hug
                          tone="ink"
                          options={[4, 5, 6].map((n) => ({ value: String(n), label: String(n) }))}
                          value={String(reciteCheckSettings.muttasil)}
                          onChange={(v) => setReciteCheckSettings(user?.id, { muttasil: Number(v) as 4 | 5 | 6 })}
                        />
                      }
                    />
                    <Row
                      label={t('settings.recite.aared')}
                      subtitle={t('settings.recite.atStop')}
                      rightSlot={
                        <PillTabs
                          compact
                          hug
                          tone="ink"
                          options={[{ value: '0', label: t('settings.recite.any') }, ...[2, 4, 6].map((n) => ({ value: String(n), label: String(n) }))]}
                          value={String(reciteCheckSettings.aared)}
                          onChange={(v) => setReciteCheckSettings(user?.id, { aared: Number(v) as 0 | 2 | 4 | 6 })}
                        />
                      }
                    />
                  </>
                ) : null}
                <Row
                  icon="mic-outline"
                  label={t('settings.recite.save')}
                  subtitle={t('settings.recite.saveSub')}
                  rightSlot={
                    <SettingSwitch
                      value={reciteCheckSettings.saveRecording}
                      onValueChange={(saveRecording) => setReciteCheckSettings(user?.id, { saveRecording })}
                      accessibilityLabel={t('settings.recite.save')}
                      testID="settings-recite-save"
                    />
                  }
                />
                <Row
                  icon="bookmark-outline"
                  label={t('settings.recite.showPast')}
                  subtitle={t('settings.recite.showPastSub')}
                  rightSlot={
                    <SettingSwitch
                      value={reciteCheckSettings.showPast}
                      onValueChange={(showPast) => setReciteCheckSettings(user?.id, { showPast })}
                      accessibilityLabel={t('settings.recite.showPast')}
                      testID="settings-recite-past"
                    />
                  }
                />
                {isDevVariant() ? (
                  <Row
                    icon="volume-medium-outline"
                    label={t('settings.recite.mistakeSound')}
                    subtitle={t('settings.recite.mistakeSoundSub')}
                    rightSlot={
                      <SettingSwitch
                        value={reciteCheckSettings.mistakeSound}
                        onValueChange={(mistakeSound) => setReciteCheckSettings(user?.id, { mistakeSound })}
                        accessibilityLabel={t('settings.recite.mistakeSound')}
                        testID="settings-recite-sound"
                      />
                    }
                  />
                ) : null}
                {/* Revisely Dev's checker only: production's keeps nothing (recite-server-prod-plan.md). Here, not on the
                    Testing page, so every Dev account that recites can turn it off (RECITE-26), testers or not. */}
                {isDevVariant() ? (
                  <Row
                    icon="flask-outline"
                    label={t('settings.recite.keep')}
                    subtitle={t('settings.recite.keepSub')}
                    rightSlot={
                      <SettingSwitch
                        value={reciteCheckSettings.keep}
                        onValueChange={(keep) => setReciteCheckSettings(user?.id, { keep })}
                        accessibilityLabel={t('settings.recite.keep')}
                        testID="settings-recite-check-keep"
                      />
                    }
                  />
                ) : null}
              </>
            ) : null}
          </Section>
        ) : null}
        {page === 'revo' ? (
          <>
            {revoShown && (
              <Section footer={t('settings.revo.footer')}>
                <View style={v2.iconRow} testID="revo-settings-row">
                  <SettingIcon name="sparkles-outline" />
                  <View style={v2.iconRowText}>
                    <Text style={[typeV2.body, { color: palette.text }]}>{t('settings.revo.revo')}</Text>
                    <Text style={[typeV2.meta, { color: palette.secondary }]}>
                      {!revoOpen ? t('settings.revo.paused') : revoSettings?.optIn ? t('settings.revo.on') : t('settings.revo.off')}
                    </Text>
                  </View>
                  <SettingSwitch
                    value={revoSettings?.optIn === true}
                    onValueChange={(v) => (v ? openRevo({ view: 'optin' }) : confirmRevoOff())}
                    accessibilityLabel={t('settings.revo.revo')}
                    testID="revo-settings-switch"
                  />
                </View>
                {revoOpen ? (
                  <Row icon="play-circle-outline" label={t('settings.revo.whatRevoCanDo')} onPress={() => setRevoMoment(true)} testID="settings-revo-moment" />
                ) : null}
                {revoSettings?.optIn ? (
                  <>
                    {revoOpen ? (
                      <Row icon="bulb-outline" label={t('settings.revo.memory')} value={revoSettings.memoryOn ? t('settings.on') : t('settings.off')} onPress={() => openRevo({ view: 'memory' })} />
                    ) : null}
                    <Row icon="trash-outline" label={t('settings.revo.deleteConversations')} destructive onPress={confirmRevoHistoryDelete} />
                  </>
                ) : null}
                <Modal visible={revoMoment} animationType="fade" presentationStyle="fullScreen" onRequestClose={() => setRevoMoment(false)} statusBarTranslucent>
                  <View style={{ flex: 1, backgroundColor: palette.bg }} testID="settings-revo-moment-screen">
                    <RevoMoment
                      mode="settings"
                      title={t('settings.revo.meet')}
                      text={t('settings.revo.meetText')}
                      firstName={greetingName(user?.name, auth.currentUser?.displayName ?? null).split(' ')[0]}
                      smartTracking={smartTrackingOn(user)}
                      closable
                      onNext={() => setRevoMoment(false)}
                      onClose={() => setRevoMoment(false)}
                      onEnded={() => {
                        if (user?.id) markRevoMomentSeen(user.id);
                      }}
                    />
                  </View>
                </Modal>
              </Section>
            )}
          </>
        ) : null}
        {page === 'storage' ? (
          <Section>
            <View testID="mushaf-offline-row">
              <Row
                icon="cloud-download-outline"
                label={t('settings.mushafRows.offline')}
                subtitle={mushafText.subtitle}
                value={fontScale > 1.35 ? undefined : mushafText.value || undefined}
                onPress={() => setMushafMenu(true)}
              />
            </View>
            <Row
              icon="cellular-outline"
              label={t('settings.mushafRows.cellular')}
              rightSlot={
                <SettingSwitch
                  value={mushaf.prefs.cellular}
                  onValueChange={(v) => void setMushafCellular(v)}
                  accessibilityLabel={t('settings.mushafRows.cellularLabel')}
                />
              }
            />
            <Row
              icon="mic-outline"
              label={t('settings.activity.recordings')}
              value={
                recordings && recordings.count > 0
                  ? `${formatNumber(recordings.count)} · ${formatBytes(recordings.bytes)}`
                  : t('settings.activity.none')
              }
              onPress={
                recordings && recordings.count > 0
                  ? () =>
                      Alert.alert(
                        t('settings.activity.recordings'),
                        [
                          t('settings.activity.recordingsBody', {
                            count: recordings.count,
                            size: formatBytes(recordings.bytes),
                          }),
                          recordings.backedUp === recordings.count
                            ? t('settings.activity.allBackedUp', { count: recordings.count })
                            : recordings.backedUp > 0
                              ? t('settings.activity.someBackedUp', { n: recordings.backedUp })
                              : t('settings.activity.phoneOnly'),
                          recordings.cloudOnly > 0
                            ? t('settings.activity.cloudOnly', { count: recordings.cloudOnly })
                            : '',
                          t('settings.activity.listedInActivity'),
                        ]
                          .filter(Boolean)
                          .join(' '),
                        [
                          { text: t('settings.activity.openActivity'), onPress: openActivity },
                          {
                            text: t('settings.activity.deleteAll'),
                            style: 'destructive',
                            onPress: () =>
                              Alert.alert(
                                t('settings.activity.deleteAllTitle'),
                                t('settings.activity.deleteAllBody'),
                                [
                                { text: t('common.cancel'), style: 'cancel' },
                                {
                                  text: t('settings.activity.deleteAll'),
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
                                      t('settings.activity.backupUnreachable'),
                                      t('settings.activity.backupUnreachableBody'),
                                      [
                                        { text: t('common.cancel'), style: 'cancel' },
                                        {
                                          text: t('settings.activity.deleteOnPhone'),
                                          style: 'destructive',
                                          onPress: async () => {
                                            await deleteAllRecordings(uid, { keepTakes: true });
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
                          { text: t('common.cancel'), style: 'cancel' },
                        ],
                      )
                  : undefined
              }
            />
            <Row
              icon="cloud-upload-outline"
              label={t('settings.activity.backUp')}
              value={localUser.recordingBackup !== false ? backupLabel(backupStatus) : undefined}
              rightSlot={
                <SettingSwitch
                  value={localUser.recordingBackup !== false}
                  onValueChange={handleBackupToggle}
                  accessibilityLabel={t('settings.activity.backUpLabel')}
                />
              }
            />
            {localUser.recordingBackup !== false && (
              <Row
                icon="cellular-outline"
                label={t('settings.activity.backUpCellular')}
                rightSlot={
                  <SettingSwitch
                    value={localUser.recordingBackupCellular === true}
                    onValueChange={(v) =>
                      updateUser({ recordingBackupCellular: v }).catch((err) =>
                        logger.warn('Could not change mobile data backup', err),
                      )
                    }
                    accessibilityLabel={t('settings.activity.backUpCellularLabel')}
                  />
                }
              />
            )}
            {speechModelShown ? (
              <Row
                icon="search-outline"
                label={t('settings.revision.speechModel')}
                subtitle={t('settings.revision.speechSearches')}
                value={
                  speechModel.status === 'ready'
                    ? formatModelSize(speechModel.bytes)
                    : speechModel.status === 'downloading'
                      ? `${Math.round(speechModel.progress * 100)}%`
                      : t('settings.revision.notDownloaded')
                }
                onPress={() => (speechModel.status === 'ready' ? setDeleteSpeechOpen(true) : setSpeechSheet(true))}
              />
            ) : null}
          </Section>
        ) : null}
        {page === 'appearance' ? (
          <Section>
            <View style={v2.iconRow}>
              <SettingIcon name="color-palette-outline" />
              <View style={styles.rowText}>
                <Text style={[typeV2.body, { color: theme.textPrimary }]}>{t('settings.appearance.theme')}</Text>
              </View>
              <ThemeSegmentedControl
                value={themeMode}
                onChange={setThemeMode}
                options={
                  systemAppearanceAvailable()
                    ? [
                        { value: 'system', label: t('settings.appearance.system') },
                        { value: 'light', label: t('settings.appearance.light') },
                        { value: 'dark', label: t('settings.appearance.dark') },
                      ]
                    : [
                        { value: 'light', label: t('settings.appearance.light') },
                        { value: 'dark', label: t('settings.appearance.dark') },
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
            {languagePickerOffered() ? (
              <Row
                icon="language-outline"
                label={t('settings.language.row')}
                value={chosenLanguage === 'system' ? t('settings.language.system') : LANGUAGE_NAMES[chosenLanguage]}
                onPress={() => setLanguageSheet(true)}
                testID="settings-language"
              />
            ) : null}
            {/* Revisely Dev's until the release switch (THEME-1): decorations, kept on this phone. Just the
                name, no subtitle (Majd, Nov 21 2026). */}
            {ramadanThemeOffered() ? (
              <Row
                icon="moon-outline"
                label={t('settings.appearance.ramadan')}
                rightSlot={
                  <SettingSwitch
                    value={ramadanTheme}
                    onValueChange={(on) => void setRamadanTheme(on)}
                    accessibilityLabel={t('settings.appearance.ramadan')}
                    testID="settings-ramadan-theme"
                  />
                }
              />
            ) : null}
            {/* Revisely Dev only (TAB-2): Activity as a tab between Home and Read, to compare with the button at the
                top of Home (Majd, Nov 23 2026). Kept on this phone, off until turned on. */}
            {activityTabOffered() ? (
              <Row
                icon="pulse-outline"
                label={t('settings.appearance.activityTab')}
                subtitle={t('settings.appearance.activityTabSub')}
                rightSlot={
                  <SettingSwitch
                    value={activityTab}
                    onValueChange={(on) => void setActivityTab(on)}
                    accessibilityLabel={t('settings.appearance.activityTab')}
                    testID="settings-activity-tab"
                  />
                }
              />
            ) : null}
          </Section>
        ) : null}
        {page === 'help' ? (
          <Section>
            {help.available ? (
              <Row
                icon={HELP_ICON}
                label={t('settings.support.helpButtons')}
                subtitle={t('settings.support.helpButtonsSub')}
                rightSlot={
                  <SettingSwitch
                    value={help.shown}
                    onValueChange={help.setShown}
                    accessibilityLabel={t('settings.support.helpButtonsLabel')}
                    testID="settings-help-buttons"
                  />
                }
              />
            ) : null}
            <Row
              icon={shareIcon}
              label={t('settings.support.share')}
              onPress={handleShareApp}
            />
            {rateAskEnabled() ? (
              <Row
                icon="star-outline"
                label={t('settings.support.rate')}
                onPress={() => void openRatingPage()}
                testID="settings-rate"
              />
            ) : null}
            <Row
              icon="chatbubble-ellipses-outline"
              label={t('settings.support.feedback')}
              onPress={() => {
                setFeedbackText('');
                setShowFeedbackModal(true);
              }}
            />
            <Row
              icon="bug-outline"
              label={t('settings.support.report')}
              onPress={openReportProblem}
            />
            <Row
              icon="mail-outline"
              label={t('settings.support.contact')}
              onPress={() => void openEmail(supportMailto(), SUPPORT_EMAIL)}
            />
          </Section>
        ) : null}
        {page === 'about' ? (
          <Section>
            {replayOffered(user) ? (
              <Row
                icon="sparkles-outline"
                label={t('settings.about.whatsNew')}
                onPress={() => setWhatsNewOpen(true)}
                testID="settings-whats-new"
              />
            ) : null}
            {reciteCheck ? (
              <Row
                icon="information-circle-outline"
                label={t('settings.about.reciteNotice')}
                onPress={() => setReciteNotice(true)}
                testID="settings-recite-check-notice"
              />
            ) : null}
            <Row
              icon="document-text-outline"
              label={t('settings.about.privacy')}
              onPress={() => void openWebPage('https://revisely.app/privacy/')}
            />
            <Row
              icon="document-outline"
              label={t('settings.about.terms')}
              onPress={() => void openWebPage('https://revisely.app/terms/')}
            />
            {showsModelLicense() ? (
              <Row icon="ribbon-outline" label={t('settings.about.licences')} onPress={() => setLicences(true)} testID="settings-licences" />
            ) : null}
            <AppInfo tools={showsUpdateTools(user)} />
          </Section>
        ) : null}
        {page === 'testing' ? (
          <>
            {firebaseUser && showsResetMyData(user) && (
              <Section>
                <View testID="reset-data-row">
                  <Row
                    icon="refresh-outline"
                    label={t('settings.reset.title')}
                    subtitle={t('settings.testing.resetSub')}
                    destructive
                    onPress={() => setResetSheet(true)}
                    testID="settings-reset-data"
                  />
                </View>
                <Row
                  icon="sparkles-outline"
                  label={t('settings.testing.whatsNewAtLaunch')}
                  subtitle={t('settings.testing.whatsNewAtLaunchSub')}
                  rightSlot={
                    <SettingSwitch
                      value={whatsNewSaved?.forced === true}
                      onValueChange={(on) => firebaseUser && setForcedAtLaunch(firebaseUser.uid, on)}
                      accessibilityLabel={t('settings.testing.whatsNewAtLaunch')}
                      testID="settings-whats-new-launch"
                    />
                  }
                />
                {/* Revisely Dev only: the reminders this phone will show, the days after tomorrow's too (REMIND-2). */}
                {isDevVariant() ? <ScheduledRemindersRow /> : null}
                {/* Revisely Dev only: which model its checker runs for each level (Majd, Nov 18 2026). */}
                {reciteCheck && isDevVariant() ? <CheckerModelRow /> : null}
                {/* Revisely Dev only: Recite's model timed on this phone (ONDEV-1). */}
                {isDevVariant() ? (
                  <Row
                    icon="speedometer-outline"
                    label={t('settings.testing.bench')}
                    subtitle={t('settings.testing.benchSub')}
                    onPress={() => navigation.navigate('OnDeviceBench')}
                    testID="settings-on-device-bench"
                  />
                ) : null}
                {reciteCheck ? (
                  <Row
                    icon="sparkles-outline"
                    label={t('settings.testing.premium')}
                    subtitle={t('settings.testing.premiumSub')}
                    rightSlot={
                      <SettingSwitch
                        value={premium.has}
                        disabled={premiumBusy || !premium.known}
                        onValueChange={switchPremium}
                        accessibilityLabel={t('settings.testing.premium')}
                        testID="settings-premium"
                      />
                    }
                  />
                ) : null}
                {showsTestScenarios(user) && (
                  <View testID="test-scenario-row">
                    <Row
                      icon="flask-outline"
                      label={t('settings.scenario.title')}
                      subtitle={t('settings.testing.scenarioSub')}
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
                      label={t('settings.testing.sendHeld')}
                      subtitle={t('settings.testing.sendHeldSub')}
                      onPress={() => firebaseUser && releaseSync(firebaseUser.uid)}
                    />
                  </View>
                )}
              </Section>
            )}
          </>
        ) : null}
      </ScrollView>
      <SpeechModelSheet
        visible={speechSheet}
        onClose={() => setSpeechSheet(false)}
        onReady={() => setSpeechSheet(false)}
      />
      <ActionSheet
        visible={languageSheet}
        onClose={() => setLanguageSheet(false)}
        title={t('settings.language.row')}
        actions={[
          {
            key: 'system',
            label: t('settings.language.system'),
            subtitle: t('settings.language.systemSub', { language: LANGUAGE_NAMES[resolveChoice('system')] }),
            selected: chosenLanguage === 'system',
            onPress: () => pickLanguage('system'),
          },
          ...offeredLanguages().map((language) => ({
            key: language,
            label: LANGUAGE_NAMES[language],
            selected: chosenLanguage === language,
            onPress: () => pickLanguage(language),
          })),
        ]}
        testID="language-sheet"
      />
      <ActionSheet
        visible={checkLevelSheet && strictOffered()}
        onClose={() => setCheckLevelSheet(false)}
        title={t('settings.recite.level')}
        actions={[
          {
            key: 'words',
            label: t('settings.recite.words'),
            subtitle: t('settings.recite.wordsSub'),
            selected: reciteCheckSettings.level !== 'strict',
            onPress: () => setReciteCheckSettings(user?.id, { level: 'words' }),
          },
          {
            key: 'strict',
            label: t('settings.recite.strict'),
            subtitle: t('settings.recite.strictSub'),
            selected: reciteCheckSettings.level === 'strict',
            onPress: () => setReciteCheckSettings(user?.id, { level: 'strict' }),
          },
        ]}
        testID="check-level-sheet"
      />
      <ActionSheet
        visible={deleteSpeechOpen}
        onClose={() => setDeleteSpeechOpen(false)}
        title={t('settings.revision.speechModel')}
        message={t('settings.revision.deleteSpeech', { size: formatModelSize() })}
        actions={[{ key: 'delete', label: t('settings.revision.deleteSpeechModel'), icon: 'trash-outline', destructive: true, onPress: removeSpeechModel }]}
        testID="speech-model-delete-menu"
      />
      <MushafPickerSheet visible={mushafPicker} onClose={() => setMushafPicker(false)} />
      {replayOffered(user) ? <WhatsNewReplay visible={whatsNewOpen} onClose={() => setWhatsNewOpen(false)} /> : null}
      <ActionSheet
        visible={refusedSheet}
        onClose={() => setRefusedSheet(false)}
        title={t('settings.notifications.refusedTitle')}
        message={t('settings.notifications.refusedBody')}
        actions={[{ key: 'settings', label: t('common.openSettings'), icon: 'settings-outline', onPress: () => Linking.openSettings() }]}
        cancelLabel={t('common.notNow')}
        testID="settings-notifications-refused"
      />
      {showsResetMyData(user) ? <ResetDataSheet visible={resetSheet} onClose={() => setResetSheet(false)} /> : null}
      {showsModelLicense() ? <LicencesSheet visible={licences} onClose={() => setLicences(false)} /> : null}
      {reciteCheck ? (
        <Sheet visible={reciteNotice} onClose={() => setReciteNotice(false)} title={t('settings.about.reciteNoticeTitle')} testID="settings-recite-notice-sheet">
          <ReciteCheckNotice />
        </Sheet>
      ) : null}
      {showsTestScenarios(user) ? (
        <TestScenarioSheet visible={scenarioSheet} onClose={() => setScenarioSheet(false)} />
      ) : null}
      <ActionSheet
        visible={mushafMenu}
        onClose={() => setMushafMenu(false)}
        title={t('settings.mushafRows.offline')}
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
          onOpenVoice={(prayer) => {
            setPrayerSheet(null);
            navigation.navigate('AthanVoice', { prayer });
          }}
        />
      ) : null}

      <TextSheetV2
        visible={showNameModal}
        title={t('settings.account.displayName')}
        message={t('settings.account.nameMessage')}
        value={tempName}
        onChange={setTempName}
        placeholder={t('settings.account.namePlaceholder')}
        maxLength={40}
        inputRef={nameInputRef}
        // Focus once the sheet is up, so the keyboard lifts a visible sheet.
        onShow={() => nameInputRef.current?.focus()}
        onCancel={() => setShowNameModal(false)}
        save={{ label: t('common.save'), onPress: handleSaveName }}
        testID="name-sheet"
      />
      <TextSheetV2
        visible={showFeedbackModal}
        title={t('settings.support.feedback')}
        message={t('settings.support.feedbackMessage')}
        value={feedbackText}
        onChange={setFeedbackText}
        placeholder={t('settings.support.feedbackPlaceholder')}
        maxLength={2000}
        multiline
        onCancel={() => setShowFeedbackModal(false)}
        save={{
          label: feedbackSubmitting ? t('settings.support.sending') : t('settings.support.submit'),
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
      left={{ label: t('common.cancel'), onPress: onCancel, testID: `${testID}-cancel` }}
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
  // Your account: the first row of the first level, and the head of the Account page.
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: layoutV2.gutter,
    paddingVertical: 16,
    borderBottomWidth: layoutV2.hairline,
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

