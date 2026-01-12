import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, Switch, Alert, Modal } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../../components/Header';
import { Button } from '../../components/Button';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { SettingsStackParamList } from '../../navigation/MainNavigator';
import { scheduleDailyReminder } from '../../lib/notifications';
import { Paths, File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

type NavigationProp = NativeStackNavigationProp<SettingsStackParamList, 'SettingsMain'>;

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 15, 30, 45];

export default function SettingsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { user, saveUser, pages, logs, savePages, loadData } = useApp();
  const { firebaseUser, isAuthenticated, signOutUser } = useAuth();
  const { theme, themeMode, setThemeMode } = useTheme();
  const [localUser, setLocalUser] = useState(user);

  // Modal states
  const [showCapacityModal, setShowCapacityModal] = useState(false);
  const [showTimeModal, setShowTimeModal] = useState(false);
  const [tempCapacity, setTempCapacity] = useState(user?.dailyPageCapacity ?? 20);
  const [tempHour, setTempHour] = useState(parseInt(user?.reminderTime?.split(':')[0] ?? '8'));
  const [tempMinute, setTempMinute] = useState(parseInt(user?.reminderTime?.split(':')[1] ?? '0'));

  if (!localUser) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const updateUser = async (updates: Partial<typeof localUser>) => {
    const updated = { ...localUser, ...updates };
    setLocalUser(updated);
    await saveUser(updated);
  };

  const toggleDay = (dayIndex: number) => {
    const newActiveDays = localUser.activeDays.includes(dayIndex)
      ? localUser.activeDays.filter(d => d !== dayIndex)
      : [...localUser.activeDays, dayIndex].sort();
    updateUser({ activeDays: newActiveDays });
  };

  const handleNotificationToggle = async (enabled: boolean) => {
    await updateUser({ notificationsEnabled: enabled });
    await scheduleDailyReminder(localUser.reminderTime, enabled);
  };

  const handleDangerAlertToggle = async (enabled: boolean) => {
    await updateUser({ dangerAlertEnabled: enabled });
  };

  const handleSaveCapacity = async () => {
    await updateUser({ dailyPageCapacity: tempCapacity });
    setShowCapacityModal(false);
  };

  const handleSaveTime = async () => {
    const newTime = `${tempHour.toString().padStart(2, '0')}:${tempMinute.toString().padStart(2, '0')}`;
    await updateUser({ reminderTime: newTime });
    await scheduleDailyReminder(newTime, localUser.notificationsEnabled);
    setShowTimeModal(false);
  };

  const handleExportData = async () => {
    try {
      const data = {
        user: localUser,
        pages,
        logs,
        exportedAt: new Date().toISOString(),
        version: '1.0.0',
      };

      const file = new File(Paths.document, 'revision-buddy-export.json');
      await file.write(JSON.stringify(data, null, 2));

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri);
      } else {
        Alert.alert('Export', 'Data exported to: ' + file.uri);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to export data');
    }
  };

  const handleImportData = async () => {
    Alert.alert(
      'Import Data',
      'To import data, please share your backup file with this app from the Files app or another source.',
      [{ text: 'OK' }]
    );
  };

  const handleResetData = () => {
    Alert.alert(
      'Reset All Data',
      'This will permanently delete all your progress, revision history, and settings. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            try {
              // Reset pages to initial state
              const resetPages = pages.map(p => ({
                ...p,
                status: 'not_memorized' as const,
                dateMemorized: null,
                lastRevisedDate: null,
                weaknessRating: 4,
                totalRevisionCount: 0,
                skipCount: 0,
              }));
              await savePages(resetPages);

              Alert.alert('Success', 'All data has been reset.');
              await loadData();
            } catch (error) {
              Alert.alert('Error', 'Failed to reset data');
            }
          },
        },
      ]
    );
  };

  const formatTime = (time: string) => {
    const [hour, minute] = time.split(':').map(Number);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minute.toString().padStart(2, '0')} ${ampm}`;
  };

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out? Your local data will be preserved.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          onPress: async () => {
            try {
              await signOutUser();
            } catch (error) {
              Alert.alert('Error', 'Failed to sign out');
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <Header title="Settings" />

        {/* Account Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>Account</Text>

          {isAuthenticated && firebaseUser ? (
            <>
              <View style={[styles.row, { borderBottomColor: theme.border }]}>
                <Text style={[styles.rowLabel, { color: theme.textPrimary }]}>Email</Text>
                <Text style={[styles.rowValue, { color: theme.textSecondary }]}>{firebaseUser.email}</Text>
              </View>

              <View style={[styles.row, { borderBottomColor: theme.border }]}>
                <Text style={[styles.rowLabel, { color: theme.textPrimary }]}>Cloud Sync</Text>
                <View style={styles.syncStatus}>
                  <Ionicons name="checkmark-circle" size={16} color={theme.success} />
                  <Text style={[styles.syncStatusText, { color: theme.success }]}>Active</Text>
                </View>
              </View>

              <TouchableOpacity style={[styles.actionRow, { borderBottomColor: theme.border }]} onPress={handleSignOut}>
                <Text style={[styles.actionRowText, { color: theme.textPrimary }]}>Sign Out</Text>
                <Text style={[styles.actionRowArrow, { color: theme.textMuted }]}>›</Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={[styles.offlineNotice, { backgroundColor: theme.warningBg, borderColor: theme.warning }]}>
              <Text style={[styles.offlineText, { color: theme.textPrimary }]}>Using offline mode</Text>
              <Text style={[styles.offlineHint, { color: theme.textSecondary }]}>
                Your progress is only saved on this device.
              </Text>
              <Text style={[styles.offlineWarning, { color: theme.textMuted }]}>
                Create an account to backup your data and sync across devices.
              </Text>
              <TouchableOpacity
                style={[styles.createAccountButton, { backgroundColor: theme.bgDark }]}
                onPress={() => navigation.getParent()?.navigate('Auth')}
              >
                <Text style={[styles.createAccountText, { color: theme.textInverse }]}>Create Account</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Appearance Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>Appearance</Text>
          <View style={[styles.row, { borderBottomColor: theme.border }]}>
            <Text style={[styles.rowLabel, { color: theme.textPrimary }]}>Theme</Text>
            <View style={styles.themeSelector}>
              <TouchableOpacity
                style={[
                  styles.themeButton,
                  { backgroundColor: theme.bgAlt, borderColor: theme.border },
                  themeMode === 'light' && { backgroundColor: theme.bgDark, borderColor: theme.bgDark },
                ]}
                onPress={() => setThemeMode('light')}
              >
                <Ionicons
                  name="sunny-outline"
                  size={16}
                  color={themeMode === 'light' ? theme.textInverse : theme.textSecondary}
                />
                <Text
                  style={[
                    styles.themeButtonText,
                    { color: themeMode === 'light' ? theme.textInverse : theme.textSecondary },
                  ]}
                >
                  Light
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.themeButton,
                  { backgroundColor: theme.bgAlt, borderColor: theme.border },
                  themeMode === 'dark' && { backgroundColor: theme.bgDark, borderColor: theme.bgDark },
                ]}
                onPress={() => setThemeMode('dark')}
              >
                <Ionicons
                  name="moon-outline"
                  size={16}
                  color={themeMode === 'dark' ? theme.textInverse : theme.textSecondary}
                />
                <Text
                  style={[
                    styles.themeButtonText,
                    { color: themeMode === 'dark' ? theme.textInverse : theme.textSecondary },
                  ]}
                >
                  Dark
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.themeButton,
                  { backgroundColor: theme.bgAlt, borderColor: theme.border },
                  themeMode === 'system' && { backgroundColor: theme.bgDark, borderColor: theme.bgDark },
                ]}
                onPress={() => setThemeMode('system')}
              >
                <Ionicons
                  name="phone-portrait-outline"
                  size={16}
                  color={themeMode === 'system' ? theme.textInverse : theme.textSecondary}
                />
                <Text
                  style={[
                    styles.themeButtonText,
                    { color: themeMode === 'system' ? theme.textInverse : theme.textSecondary },
                  ]}
                >
                  System
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>Revision</Text>

          <View style={[styles.row, { borderBottomColor: theme.border }]}>
            <Text style={[styles.rowLabel, { color: theme.textPrimary }]}>Mode</Text>
            <View style={styles.modeSelector}>
              <TouchableOpacity
                style={[
                  styles.modeButton,
                  { backgroundColor: theme.bgAlt, borderColor: theme.border },
                  localUser.mode === 'weighted' && { backgroundColor: theme.bgDark, borderColor: theme.bgDark },
                ]}
                onPress={() => updateUser({ mode: 'weighted' })}
              >
                <Text
                  style={[
                    styles.modeButtonText,
                    { color: localUser.mode === 'weighted' ? theme.textInverse : theme.textSecondary },
                  ]}
                >
                  Weighted
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modeButton,
                  { backgroundColor: theme.bgAlt, borderColor: theme.border },
                  localUser.mode === 'sequential' && { backgroundColor: theme.bgDark, borderColor: theme.bgDark },
                ]}
                onPress={() => updateUser({ mode: 'sequential' })}
              >
                <Text
                  style={[
                    styles.modeButtonText,
                    { color: localUser.mode === 'sequential' ? theme.textInverse : theme.textSecondary },
                  ]}
                >
                  Sequential
                </Text>
              </TouchableOpacity>
            </View>
          </View>
          <Text style={[styles.modeHint, { color: theme.textSecondary }]}>
            {localUser.mode === 'weighted'
              ? 'Pages prioritized by urgency, weakness, and time since last revision'
              : 'Pages reviewed in order from beginning to end'}
          </Text>
          <Text style={[styles.modeNote, { color: theme.textMuted }]}>
            Your revision history is preserved when switching modes.
          </Text>

          <TouchableOpacity
            style={[styles.row, { borderBottomColor: theme.border }]}
            onPress={() => {
              setTempCapacity(localUser.dailyPageCapacity);
              setShowCapacityModal(true);
            }}
          >
            <Text style={[styles.rowLabel, { color: theme.textPrimary }]}>Daily Capacity</Text>
            <View style={styles.rowRight}>
              <Text style={[styles.rowValue, { color: theme.textSecondary }]}>{localUser.dailyPageCapacity} pages</Text>
              <Text style={[styles.rowArrow, { color: theme.textMuted }]}>›</Text>
            </View>
          </TouchableOpacity>

          <View style={[styles.row, { borderBottomColor: theme.border }]}>
            <Text style={[styles.rowLabel, { color: theme.textPrimary }]}>Active Days</Text>
            <View style={styles.daysRow}>
              {DAYS.map((day, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.dayButton,
                    { backgroundColor: theme.bgAlt, borderColor: theme.border },
                    localUser.activeDays.includes(index) && { backgroundColor: theme.bgDark, borderColor: theme.bgDark },
                  ]}
                  onPress={() => toggleDay(index)}
                >
                  <Text
                    style={[
                      styles.dayButtonText,
                      { color: localUser.activeDays.includes(index) ? theme.textInverse : theme.textSecondary },
                    ]}
                  >
                    {day}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>Notifications</Text>

          <View style={[styles.row, { borderBottomColor: theme.border }]}>
            <Text style={[styles.rowLabel, { color: theme.textPrimary }]}>Daily Reminder</Text>
            <Switch
              value={localUser.notificationsEnabled}
              onValueChange={handleNotificationToggle}
              trackColor={{ false: theme.border, true: theme.accent }}
              thumbColor={theme.bg}
            />
          </View>

          <View style={[styles.row, { borderBottomColor: theme.border }]}>
            <Text style={[styles.rowLabel, { color: theme.textPrimary }]}>Danger Alerts</Text>
            <Switch
              value={localUser.dangerAlertEnabled}
              onValueChange={handleDangerAlertToggle}
              trackColor={{ false: theme.border, true: theme.accent }}
              thumbColor={theme.bg}
            />
          </View>

          <TouchableOpacity
            style={[styles.row, { borderBottomColor: theme.border }]}
            onPress={() => {
              const [h, m] = localUser.reminderTime.split(':').map(Number);
              setTempHour(h);
              setTempMinute(m);
              setShowTimeModal(true);
            }}
          >
            <Text style={[styles.rowLabel, { color: theme.textPrimary }]}>Reminder Time</Text>
            <View style={styles.rowRight}>
              <Text style={[styles.rowValue, { color: theme.textSecondary }]}>{formatTime(localUser.reminderTime)}</Text>
              <Text style={[styles.rowArrow, { color: theme.textMuted }]}>›</Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>Data</Text>

          <TouchableOpacity
            style={[styles.actionRow, { borderBottomColor: theme.border }]}
            onPress={handleExportData}
          >
            <Text style={[styles.actionRowText, { color: theme.textPrimary }]}>Export Data</Text>
            <Text style={[styles.actionRowArrow, { color: theme.textMuted }]}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionRow, { borderBottomColor: theme.border }]}
            onPress={handleImportData}
          >
            <Text style={[styles.actionRowText, { color: theme.textPrimary }]}>Import Data</Text>
            <Text style={[styles.actionRowArrow, { color: theme.textMuted }]}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionRow, { borderBottomColor: theme.border }]}
            onPress={handleResetData}
          >
            <Text style={[styles.actionRowText, { color: theme.error }]}>Reset All Data</Text>
            <Text style={[styles.actionRowArrow, { color: theme.textMuted }]}>›</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Daily Capacity Modal */}
      <Modal
        visible={showCapacityModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCapacityModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.bg, borderTopColor: theme.border }]}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowCapacityModal(false)}>
                <Text style={[styles.modalCancel, { color: theme.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>Daily Capacity</Text>
              <TouchableOpacity onPress={handleSaveCapacity}>
                <Text style={[styles.modalSave, { color: theme.accent }]}>Save</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.capacityDisplay}>
              <Text style={[styles.capacityNumber, { color: theme.textPrimary }]}>{tempCapacity}</Text>
              <Text style={[styles.capacityLabel, { color: theme.textSecondary }]}>pages</Text>
            </View>

            <Slider
              style={styles.slider}
              minimumValue={5}
              maximumValue={60}
              step={1}
              value={tempCapacity}
              onValueChange={setTempCapacity}
              minimumTrackTintColor={theme.accent}
              maximumTrackTintColor={theme.border}
              thumbTintColor={theme.accent}
            />

            <View style={styles.sliderLabels}>
              <Text style={[styles.sliderLabel, { color: theme.textMuted }]}>5</Text>
              <Text style={[styles.sliderLabel, { color: theme.textMuted }]}>
                {tempCapacity <= 10 ? 'Light' : tempCapacity <= 20 ? '~1 juz' : tempCapacity <= 40 ? '~2 juz' : 'Intensive'}
              </Text>
              <Text style={[styles.sliderLabel, { color: theme.textMuted }]}>60</Text>
            </View>
          </View>
        </View>
      </Modal>

      {/* Time Picker Modal */}
      <Modal
        visible={showTimeModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTimeModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.bg, borderTopColor: theme.border }]}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowTimeModal(false)}>
                <Text style={[styles.modalCancel, { color: theme.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>Reminder Time</Text>
              <TouchableOpacity onPress={handleSaveTime}>
                <Text style={[styles.modalSave, { color: theme.accent }]}>Save</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.timePickerContainer}>
              <View style={styles.timeColumn}>
                <Text style={[styles.timeColumnLabel, { color: theme.textMuted }]}>Hour</Text>
                <ScrollView style={styles.timeScroll} showsVerticalScrollIndicator={false}>
                  {HOURS.map((hour) => (
                    <TouchableOpacity
                      key={hour}
                      style={[
                        styles.timeOption,
                        tempHour === hour && { backgroundColor: theme.bgDark },
                      ]}
                      onPress={() => setTempHour(hour)}
                    >
                      <Text
                        style={[
                          styles.timeOptionText,
                          { color: tempHour === hour ? theme.textInverse : theme.textSecondary },
                          tempHour === hour && { fontWeight: '600' },
                        ]}
                      >
                        {hour.toString().padStart(2, '0')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <Text style={[styles.timeSeparator, { color: theme.textPrimary }]}>:</Text>

              <View style={styles.timeColumn}>
                <Text style={[styles.timeColumnLabel, { color: theme.textMuted }]}>Minute</Text>
                <ScrollView style={styles.timeScroll} showsVerticalScrollIndicator={false}>
                  {MINUTES.map((minute) => (
                    <TouchableOpacity
                      key={minute}
                      style={[
                        styles.timeOption,
                        tempMinute === minute && { backgroundColor: theme.bgDark },
                      ]}
                      onPress={() => setTempMinute(minute)}
                    >
                      <Text
                        style={[
                          styles.timeOptionText,
                          { color: tempMinute === minute ? theme.textInverse : theme.textSecondary },
                          tempMinute === minute && { fontWeight: '600' },
                        ]}
                      >
                        {minute.toString().padStart(2, '0')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    ...typography.bodyMedium,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    ...typography.label,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  rowLabel: {
    ...typography.bodyMedium,
  },
  rowValue: {
    ...typography.bodyMedium,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  rowArrow: {
    ...typography.bodyLarge,
  },
  syncStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  syncStatusText: {
    ...typography.bodySmall,
    fontWeight: '500',
  },
  themeSelector: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  themeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderRadius: 0,
  },
  themeButtonText: {
    ...typography.bodySmall,
    fontSize: 11,
  },
  modeSelector: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  modeButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderRadius: 0,
  },
  modeButtonText: {
    ...typography.bodySmall,
  },
  modeHint: {
    ...typography.bodySmall,
    marginTop: spacing.xs,
  },
  modeNote: {
    ...typography.bodySmall,
    marginTop: spacing.xs,
    fontStyle: 'italic',
  },
  daysRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  dayButton: {
    width: 32,
    height: 32,
    borderWidth: 1,
    borderRadius: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayButtonText: {
    ...typography.bodySmall,
    fontWeight: '500',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  actionRowText: {
    ...typography.bodyMedium,
  },
  actionRowArrow: {
    ...typography.bodyLarge,
  },
  offlineNotice: {
    borderWidth: 1,
    padding: spacing.md,
  },
  offlineText: {
    ...typography.bodyMedium,
    marginBottom: spacing.xs,
  },
  offlineHint: {
    ...typography.bodySmall,
    marginBottom: spacing.xs,
  },
  offlineWarning: {
    ...typography.bodySmall,
    marginBottom: spacing.md,
  },
  createAccountButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  createAccountText: {
    ...typography.bodyMedium,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopWidth: 1,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  modalTitle: {
    ...typography.displaySmall,
  },
  modalCancel: {
    ...typography.bodyMedium,
  },
  modalSave: {
    ...typography.bodyMedium,
    fontWeight: '600',
  },
  capacityDisplay: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  capacityNumber: {
    ...typography.displayLarge,
    marginRight: spacing.xs,
  },
  capacityLabel: {
    ...typography.bodyLarge,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  sliderLabel: {
    ...typography.bodySmall,
  },
  timePickerContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  timeColumn: {
    alignItems: 'center',
    width: 80,
  },
  timeColumnLabel: {
    ...typography.label,
    marginBottom: spacing.sm,
  },
  timeScroll: {
    maxHeight: 200,
  },
  timeOption: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginVertical: 2,
  },
  timeOptionText: {
    ...typography.bodyLarge,
    textAlign: 'center',
  },
  timeSeparator: {
    ...typography.displayLarge,
    marginHorizontal: spacing.md,
  },
});
