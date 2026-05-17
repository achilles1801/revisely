import React, { useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Switch,
  Alert,
  Modal,
  Platform,
  Linking,
  Share,
  TextInput,
  Pressable,
} from 'react-native';
import Constants from 'expo-constants';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { GlassCard } from '../../components/GlassCard';
import { PressableScale } from '../../components/PressableScale';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { shadows } from '../../theme/shadows';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { ThemeColors } from '../../theme/colors';
import { HomeStackParamList } from '../../navigation/MainNavigator';
import { scheduleDailyReminder } from '../../lib/notifications';
import * as firestoreService from '../../services/firestoreService';

type NavigationProp = NativeStackNavigationProp<HomeStackParamList, 'Settings'>;

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 15, 30, 45];

function formatActiveDays(days: number[]): string {
  if (days.length === 0) return 'None';
  if (days.length === 7) return 'Every day';
  const sorted = [...days].sort();
  const isWeekdays =
    sorted.length === 5 && sorted.every((d, i) => d === i + 1);
  if (isWeekdays) return 'Weekdays';
  if (sorted.length === 2 && sorted[0] === 0 && sorted[1] === 6) return 'Weekends';
  return sorted.map((d) => DAY_NAMES_SHORT[d]).join(', ');
}

type IconName = keyof typeof Ionicons.glyphMap;

// ---------------------------------------------------------------------------
// Reusable bits — kept inline since they're tightly coupled to settings rows.
// ---------------------------------------------------------------------------

function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <View style={{ marginBottom: spacing.lg }}>
      {title && (
        <Text
          style={[
            typography.label,
            { color: theme.textMuted, marginBottom: spacing.xs, paddingHorizontal: spacing.md },
          ]}
        >
          {title}
        </Text>
      )}
      <View style={{ borderRadius: radius.md, overflow: 'hidden' }}>
        <GlassCard style={StyleSheet.absoluteFillObject} />
        {children}
      </View>
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
  const { theme } = useTheme();
  const labelColor = destructive ? theme.error : theme.textPrimary;

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
      {icon && (
        <View
          style={[
            styles.rowIcon,
            { backgroundColor: (iconColor ?? theme.accent) + '20' },
          ]}
        >
          <Ionicons name={icon} size={16} color={iconColor ?? theme.accent} />
        </View>
      )}
      <View style={styles.rowText}>
        <Text style={[typography.bodyMedium, { color: labelColor }]}>{label}</Text>
      </View>
      {value !== undefined && (
        <Text style={[typography.bodyMedium, { color: theme.textSecondary }]} numberOfLines={1}>
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
  const [showCapacityModal, setShowCapacityModal] = useState(false);
  const [showTimeModal, setShowTimeModal] = useState(false);
  const [showNameModal, setShowNameModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [showActiveDaysModal, setShowActiveDaysModal] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [tempCapacity, setTempCapacity] = useState(user?.dailyPageCapacity ?? 20);
  const [tempHour, setTempHour] = useState(parseInt(user?.reminderTime?.split(':')[0] ?? '8'));
  const [tempMinute, setTempMinute] = useState(parseInt(user?.reminderTime?.split(':')[1] ?? '0'));
  const [tempName, setTempName] = useState(user?.name ?? '');
  const [tempActiveDays, setTempActiveDays] = useState<number[]>(user?.activeDays ?? []);

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

  const openActiveDaysModal = () => {
    setTempActiveDays(localUser.activeDays);
    setShowActiveDaysModal(true);
  };

  const toggleTempDay = (dayIndex: number) => {
    Haptics.selectionAsync();
    setTempActiveDays((prev) =>
      prev.includes(dayIndex)
        ? prev.filter((d) => d !== dayIndex)
        : [...prev, dayIndex].sort(),
    );
  };

  const handleSaveActiveDays = async () => {
    await updateUser({ activeDays: tempActiveDays });
    setShowActiveDaysModal(false);
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

  const handleSaveCapacity = async () => {
    await updateUser({ dailyPageCapacity: tempCapacity });
    setShowCapacityModal(false);
  };

  const handleSaveName = async () => {
    const trimmed = tempName.trim();
    await updateUser({ name: trimmed.length > 0 ? trimmed : undefined });
    setShowNameModal(false);
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

      <ScrollView contentContainerStyle={screenStyles.content}>
        {firebaseUser && (
          <Section title="Account">
            <View
              style={[
                screenStyles.profileRow,
                { borderBottomColor: theme.border },
              ]}
            >
              <View style={[screenStyles.avatar, { backgroundColor: theme.accent }]}>
                <Text style={[typography.titleLarge, { color: theme.textInverse }]}>
                  {(localUser.name ?? firebaseUser.email ?? '?')
                    .trim()
                    .charAt(0)
                    .toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1, marginLeft: spacing.md }}>
                {localUser.name && (
                  <Text
                    style={[typography.titleMedium, { color: theme.textPrimary }]}
                    numberOfLines={1}
                  >
                    {localUser.name}
                  </Text>
                )}
                <Text
                  style={[typography.bodySmall, { color: theme.textSecondary }]}
                  numberOfLines={1}
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

        <Section title="Revision">
          <View
            style={[
              styles.row,
              {
                flexDirection: 'column',
                alignItems: 'stretch',
                gap: spacing.xs,
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: theme.border,
              },
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%', gap: spacing.sm }}>
              <View style={[styles.rowIcon, { backgroundColor: theme.accent + '20' }]}>
                <Ionicons name="sparkles-outline" size={16} color={theme.accent} />
              </View>
              <View style={styles.rowText}>
                <Text style={[typography.bodyMedium, { color: theme.textPrimary }]}>Smart Tracking</Text>
              </View>
              <Switch
                value={localUser.smartTrackingEnabled}
                onValueChange={(v) => updateUser({ smartTrackingEnabled: v })}
                trackColor={{ false: theme.border, true: theme.accent }}
                thumbColor={Platform.OS === 'android' ? theme.bg : undefined}
              />
            </View>
            <Text
              style={[
                typography.bodySmall,
                { color: theme.textSecondary, marginLeft: 36, marginRight: spacing.md },
              ]}
            >
              {localUser.smartTrackingEnabled
                ? 'Rate pages during revision and unlock the Insights tab.'
                : 'Turn on to rate pages and see personalized insights.'}
            </Text>
          </View>

          <Row
            icon="layers-outline"
            label="Pages per day"
            value={`${localUser.dailyPageCapacity} pages`}
            onPress={() => {
              setTempCapacity(localUser.dailyPageCapacity);
              setShowCapacityModal(true);
            }}
          />

          <Row
            icon="calendar-outline"
            label="Active days"
            value={formatActiveDays(localUser.activeDays)}
            onPress={openActiveDaysModal}
            isLast
          />
        </Section>

        <Section title="Notifications">
          <Row
            icon="notifications-outline"
            label="Enable notifications"
            rightSlot={
              <Switch
                value={localUser.notificationsEnabled}
                onValueChange={handleNotificationToggle}
                trackColor={{ false: theme.border, true: theme.accent }}
                thumbColor={Platform.OS === 'android' ? theme.bg : undefined}
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
            <View style={[styles.rowIcon, { backgroundColor: theme.accent + '20' }]}>
              <Ionicons name="color-palette-outline" size={16} color={theme.accent} />
            </View>
            <View style={styles.rowText}>
              <Text style={[typography.bodyMedium, { color: theme.textPrimary }]}>Theme</Text>
            </View>
            <ThemeSegmentedControl
              value={themeMode}
              onChange={setThemeMode}
              options={[
                { value: 'light', label: 'Light', icon: 'sunny-outline' },
                { value: 'dark', label: 'Dark', icon: 'moon-outline' },
              ]}
            />
          </View>
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
            isLast
          />
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

      {/* Daily Capacity Sheet */}
      <BottomSheetModal visible={showCapacityModal} onClose={() => setShowCapacityModal(false)}>
        <View style={screenStyles.sheetHeader}>
          <PressableScale
            onPress={() => setShowCapacityModal(false)}
            haptic="light"
            style={{ padding: spacing.xxs }}
          >
            <Text style={[typography.bodyMedium, { color: theme.textSecondary }]}>Cancel</Text>
          </PressableScale>
          <Text style={[typography.titleMedium, { color: theme.textPrimary }]}>Pages per day</Text>
          <PressableScale
            onPress={handleSaveCapacity}
            haptic="medium"
            style={{ padding: spacing.xxs }}
          >
            <Text style={[typography.bodyMedium, { color: theme.accent, fontWeight: '700' }]}>Save</Text>
          </PressableScale>
        </View>

        <View style={screenStyles.capacityDisplay}>
          <Text style={[typography.displayLarge, { color: theme.accent }]}>{tempCapacity}</Text>
          <Text style={[typography.bodyLarge, { color: theme.textSecondary }]}>pages</Text>
        </View>

        <Slider
          style={{ width: '100%', height: 40 }}
          minimumValue={5}
          maximumValue={60}
          step={1}
          value={tempCapacity}
          onValueChange={setTempCapacity}
          minimumTrackTintColor={theme.accent}
          maximumTrackTintColor={theme.border}
          thumbTintColor={theme.accent}
        />
        <View style={screenStyles.sliderLabels}>
          <Text style={[typography.bodySmall, { color: theme.textMuted }]}>5</Text>
          <Text style={[typography.bodySmall, { color: theme.textMuted }]}>60</Text>
        </View>
      </BottomSheetModal>

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
            <Text style={[typography.label, { color: theme.textMuted, marginBottom: spacing.xs }]}>Hour</Text>
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
            <Text style={[typography.label, { color: theme.textMuted, marginBottom: spacing.xs }]}>Minute</Text>
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

      {/* Active days sheet */}
      <BottomSheetModal
        visible={showActiveDaysModal}
        onClose={() => setShowActiveDaysModal(false)}
      >
        <View style={screenStyles.sheetHeader}>
          <PressableScale
            onPress={() => setShowActiveDaysModal(false)}
            haptic="light"
            style={{ padding: spacing.xxs }}
          >
            <Text style={[typography.bodyMedium, { color: theme.textSecondary }]}>Cancel</Text>
          </PressableScale>
          <Text style={[typography.titleMedium, { color: theme.textPrimary }]}>Active days</Text>
          <PressableScale
            onPress={handleSaveActiveDays}
            haptic="medium"
            style={{ padding: spacing.xxs }}
          >
            <Text style={[typography.bodyMedium, { color: theme.accent, fontWeight: '700' }]}>Save</Text>
          </PressableScale>
        </View>

        <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md }}>
          <Text style={[typography.bodySmall, { color: theme.textSecondary, marginBottom: spacing.md }]}>
            Pick the days you want to review on.
          </Text>
          <View style={screenStyles.dayPickerRow}>
            {DAYS.map((day, index) => {
              const active = tempActiveDays.includes(index);
              return (
                <PressableScale
                  key={index}
                  onPress={() => toggleTempDay(index)}
                  haptic="none"
                  scale={0.92}
                  style={[
                    screenStyles.dayChipLarge,
                    { backgroundColor: active ? theme.accent : theme.bgAlt },
                  ]}
                >
                  <Text
                    style={[
                      typography.bodyMedium,
                      {
                        color: active ? theme.textInverse : theme.textSecondary,
                        fontWeight: '600',
                      },
                    ]}
                  >
                    {day}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
        </View>
      </BottomSheetModal>

      {/* Display name sheet */}
      <BottomSheetModal visible={showNameModal} onClose={() => setShowNameModal(false)}>
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
            value={tempName}
            onChangeText={setTempName}
            placeholder="Your name"
            placeholderTextColor={theme.textMuted}
            autoFocus
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

// Polished modal-as-sheet. Phase 6 will swap these for @gorhom/bottom-sheet.
function BottomSheetModal({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { theme } = useTheme();
  const sheetStyles = useMemo(() => makeSheetStyles(theme), [theme]);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={sheetStyles.overlay} onPress={onClose}>
        <Pressable style={sheetStyles.sheet} onPress={() => {}}>
          <GlassCard style={StyleSheet.absoluteFillObject} />
          <View style={sheetStyles.dragHandle} />
          {children}
        </Pressable>
      </Pressable>
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
    dayChipLarge: {
      width: 40,
      height: 40,
      borderRadius: radius.full,
      justifyContent: 'center',
      alignItems: 'center',
    },
    dayPickerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
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
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: theme.surface,
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
