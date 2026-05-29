import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../../components/GlassCard';
import { PressableScale } from '../../components/PressableScale';
import { MemorizationBrowser } from '../../components/MemorizationBrowser';
import {
  PageStatus,
  applyPendingChanges,
  applyPendingSurahChanges,
  pruneCustomPlanForMemorized,
} from '../../lib/memorizationChanges';
import { LiquidGlassActionBar } from '../../components/LiquidGlassTabBar';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { ThemeColors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { shadows } from '../../theme/shadows';
import type { HomeStackParamList } from '../../navigation/MainNavigator';
import type { User } from '../../types';

type NavigationProp = NativeStackNavigationProp<HomeStackParamList, 'Memorization'>;

const MEMORIZATION_GUIDE_DISMISSED_KEY = '@revisley_memorization_guide_dismissed';

export default function MemorizationScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { user, pages, updatePages, saveUser } = useApp();
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [markMode, setMarkMode] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<
    Map<number, PageStatus>
  >(new Map());
  const [pendingSurahChanges, setPendingSurahChanges] = useState<
    Map<number, PageStatus>
  >(new Map());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [reviewPromptOpen, setReviewPromptOpen] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(MEMORIZATION_GUIDE_DISMISSED_KEY).then((v) => {
      if (v !== 'true') setShowGuide(true);
    });
  }, []);

  const dismissGuideForever = async () => {
    setShowGuide(false);
    await AsyncStorage.setItem(MEMORIZATION_GUIDE_DISMISSED_KEY, 'true');
  };

  // Tab bar hides automatically because 'Memorization' is in
  // FULL_SCREEN_ROUTES inside LiquidGlassTabBar.

  const changeCount = pendingChanges.size + pendingSurahChanges.size;

  const handleBack = () => {
    if (changeCount > 0) {
      // Confirm before discarding pending changes
      setConfirmOpen(false);
      // Use a simple in-component confirm by routing through the action bar:
      // if we're in mark mode with changes, tapping back asks the user.
      if (markMode) {
        // Fall through to action bar Cancel button instead — keep this simple
        // and let the user use the explicit Cancel.
        return;
      }
    }
    navigation.goBack();
  };

  const handleCancel = () => {
    setPendingChanges(new Map());
    setPendingSurahChanges(new Map());
    setMarkMode(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { updatedPages, changedPageNumbers } = applyPendingChanges(
        pages,
        pendingChanges,
      );
      if (changedPageNumbers.length > 0) {
        await updatePages(updatedPages, changedPageNumbers);
      }

      if (user) {
        const userUpdates: Partial<User> = {};
        if (pendingSurahChanges.size > 0) {
          userUpdates.memorizedSurahs = applyPendingSurahChanges(
            user.memorizedSurahs ?? [],
            pendingSurahChanges,
          );
        }
        // Strip un-memorized pages from the custom plan so the schedule
        // doesn't surface pages the user no longer knows. We don't auto-add
        // newly-memorized pages — the user slots those in the plan editor.
        if (user.customPlan) {
          const memorizedNumbers = updatedPages
            .filter((p) => p.status === 'memorized')
            .map((p) => p.pageNumber);
          const { plan } = pruneCustomPlanForMemorized(
            user.customPlan,
            memorizedNumbers,
          );
          userUpdates.customPlan = plan;
        }
        if (Object.keys(userUpdates).length > 0) {
          await saveUser({ ...user, ...userUpdates });
        }
      }

      const hadAnyChange = changedPageNumbers.length > 0 || pendingSurahChanges.size > 0;
      setPendingChanges(new Map());
      setPendingSurahChanges(new Map());
      setMarkMode(false);
      setConfirmOpen(false);

      if (hadAnyChange && user?.customPlan) {
        setReviewPromptOpen(true);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleReviewSchedule = () => {
    setReviewPromptOpen(false);
    navigation.navigate('PlanEdit');
  };

  const memorizedPageCount = pages.filter((p) => p.status === 'memorized').length;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <PressableScale
          onPress={handleBack}
          haptic="light"
          hitSlop={12}
          style={styles.iconBtn}
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={22} color={theme.textPrimary} />
        </PressableScale>

        <View style={styles.headerCenter}>
          <Text style={styles.title}>Memorization</Text>
          <Text style={styles.subtitle}>
            {memorizedPageCount} of 604 pages memorized
          </Text>
        </View>

        <PressableScale
          onPress={() => setShowGuide(true)}
          haptic="light"
          hitSlop={8}
          style={styles.iconBtn}
          accessibilityLabel="How memorization tracking works"
        >
          <Ionicons name="help" size={16} color={theme.textPrimary} />
        </PressableScale>

        <PressableScale
          onPress={() => {
            if (markMode && changeCount === 0) {
              setMarkMode(false);
            } else if (markMode) {
              setConfirmOpen(true);
            } else {
              setMarkMode(true);
            }
          }}
          haptic="medium"
          scale={0.92}
          style={[
            styles.iconBtn,
            markMode && { backgroundColor: theme.accent },
          ]}
          accessibilityLabel={
            markMode ? 'Save or cancel marks' : 'Edit memorized pages'
          }
        >
          <Ionicons
            name={markMode ? 'checkmark' : 'pencil-outline'}
            size={18}
            color={markMode ? theme.textInverse : theme.textPrimary}
          />
        </PressableScale>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          markMode && { paddingBottom: 96 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <MemorizationBrowser
          pages={pages}
          pendingChanges={pendingChanges}
          onChange={setPendingChanges}
          baseMemorizedSurahs={user?.memorizedSurahs ?? []}
          pendingSurahChanges={pendingSurahChanges}
          onSurahChange={setPendingSurahChanges}
          markMode={markMode}
          onMarkModeChange={setMarkMode}
          hideMarkToggle
        />
      </ScrollView>

      {markMode && (
        <LiquidGlassActionBar>
          <PressableScale
            onPress={handleCancel}
            haptic="light"
            hitSlop={8}
            style={styles.actionTextBtn}
          >
            <Text
              style={[styles.actionTextBtnLabel, { color: theme.textPrimary }]}
            >
              Cancel
            </Text>
          </PressableScale>
          <View style={{ flex: 1 }} />
          <PressableScale
            onPress={() => setConfirmOpen(true)}
            haptic="medium"
            disabled={changeCount === 0}
            style={[
              styles.actionPrimary,
              {
                backgroundColor: changeCount === 0 ? 'transparent' : theme.accent,
                opacity: changeCount === 0 ? 0.5 : 1,
              },
            ]}
          >
            <Text
              style={[
                styles.actionPrimaryLabel,
                {
                  color:
                    changeCount === 0 ? theme.textMuted : theme.textInverse,
                },
              ]}
            >
              {changeCount === 0 ? 'No changes' : `Save (${changeCount})`}
            </Text>
          </PressableScale>
        </LiquidGlassActionBar>
      )}

      <ConfirmSaveSheet
        visible={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleSave}
        onDiscard={() => {
          setConfirmOpen(false);
          handleCancel();
        }}
        changeCount={changeCount}
        saving={saving}
        theme={theme}
      />

      <MemorizationGuideModal
        visible={showGuide}
        onClose={dismissGuideForever}
        theme={theme}
      />

      <ReviewScheduleSheet
        visible={reviewPromptOpen}
        onLater={() => setReviewPromptOpen(false)}
        onReview={handleReviewSchedule}
        theme={theme}
      />
    </SafeAreaView>
  );
}

function ReviewScheduleSheet({
  visible,
  onLater,
  onReview,
  theme,
}: {
  visible: boolean;
  onLater: () => void;
  onReview: () => void;
  theme: ThemeColors;
}) {
  const styles = useMemo(() => makeConfirmStyles(theme), [theme]);
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onLater}
    >
      <Pressable style={styles.overlay} onPress={onLater}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.sheet}>
          <GlassCard style={StyleSheet.absoluteFillObject} />
          <View style={styles.dragHandle} />
          <Text style={styles.title}>Schedule needs review</Text>
          <Text style={styles.intro}>
            Your custom schedule doesn't auto-adjust when memorization changes.
            Any pages you un-memorized were removed, but new pages won't be
            scheduled until you add them.
          </Text>
          <View style={styles.actions}>
            <PressableScale
              onPress={onLater}
              haptic="light"
              scale={0.98}
              style={styles.secondaryBtn}
            >
              <Text style={styles.secondaryBtnText}>Later</Text>
            </PressableScale>
            <PressableScale
              onPress={onReview}
              haptic="medium"
              scale={0.98}
              style={styles.primaryBtn}
            >
              <Text style={styles.primaryBtnText}>Review now</Text>
            </PressableScale>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function MemorizationGuideModal({
  visible,
  onClose,
  theme,
}: {
  visible: boolean;
  onClose: () => void;
  theme: ThemeColors;
}) {
  const styles = useMemo(() => makeGuideStyles(theme), [theme]);
  const steps: Array<{
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    body: string;
  }> = [
    {
      icon: 'pencil-outline',
      title: 'Tap the pencil to mark',
      body: 'The pencil icon in the top right enters mark mode. Tap pages, surahs, or juz to toggle them — the icon turns into a checkmark once you have changes.',
    },
    {
      icon: 'apps-outline',
      title: 'Three ways to find pages',
      body: 'Switch between Surahs, Juz, and Hizb at the top — same data, different lenses. Mark whichever level matches how you think about your memorization.',
    },
    {
      icon: 'save-outline',
      title: 'Changes are drafts until Save',
      body: 'Marks stay pending until you tap Save. Cancel discards everything in one tap — and tapping back during mark mode keeps your draft until you decide.',
    },
    {
      icon: 'calendar-outline',
      title: 'Your schedule follows',
      body: 'When you save, your daily revision plan adjusts to cover what you marked. More memorized = a longer cycle to keep it all fresh.',
    },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.card}>
          <GlassCard style={StyleSheet.absoluteFillObject} />
          <View style={styles.headerRow}>
            <Text style={styles.title}>How memorization tracking works</Text>
            <PressableScale
              onPress={onClose}
              haptic="light"
              style={styles.closeBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={20} color={theme.textSecondary} />
            </PressableScale>
          </View>

          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            <View style={styles.steps}>
              {steps.map((s, i) => (
                <View key={i} style={styles.step}>
                  <View style={styles.stepIcon}>
                    <Ionicons name={s.icon} size={18} color={theme.accent} />
                  </View>
                  <View style={styles.stepText}>
                    <Text style={styles.stepTitle}>{s.title}</Text>
                    <Text style={styles.stepBody}>{s.body}</Text>
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>

          <View style={styles.actions}>
            <PressableScale
              onPress={onClose}
              haptic="medium"
              scale={0.98}
              style={styles.primaryBtn}
            >
              <Text style={styles.primaryBtnText}>Got it</Text>
            </PressableScale>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeGuideStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
    },
    card: {
      width: '100%',
      maxWidth: 420,
      maxHeight: '85%',
      borderRadius: radius.lg,
      padding: spacing.lg,
      overflow: 'hidden',
      ...shadows.lg,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.md,
    },
    title: { ...typography.titleLarge, color: theme.textPrimary, flex: 1 },
    closeBtn: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.full,
    },
    scroll: { marginBottom: spacing.md },
    steps: { gap: spacing.md },
    step: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    stepIcon: {
      width: 32,
      height: 32,
      borderRadius: radius.xs,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.accent + '20',
    },
    stepText: { flex: 1 },
    stepTitle: {
      ...typography.titleSmall,
      color: theme.textPrimary,
      marginBottom: 2,
    },
    stepBody: { ...typography.bodySmall, color: theme.textSecondary },
    actions: { flexDirection: 'row', gap: spacing.sm },
    primaryBtn: {
      flex: 1,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.accent,
    },
    primaryBtnText: {
      ...typography.bodySmall,
      color: '#fff',
      fontWeight: '700',
    },
  });

function ConfirmSaveSheet({
  visible,
  onClose,
  onConfirm,
  onDiscard,
  changeCount,
  saving,
  theme,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onDiscard: () => void;
  changeCount: number;
  saving: boolean;
  theme: ThemeColors;
}) {
  const styles = useMemo(() => makeConfirmStyles(theme), [theme]);
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={saving ? undefined : onClose}
    >
      <Pressable
        style={styles.overlay}
        onPress={saving ? undefined : onClose}
      >
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.sheet}>
          <GlassCard style={StyleSheet.absoluteFillObject} />
          <View style={styles.dragHandle} />
          <Text style={styles.title}>Save {changeCount} change{changeCount === 1 ? '' : 's'}?</Text>
          <Text style={styles.intro}>
            Your revision schedule adjusts based on what's memorized. You can
            discard these changes if you tapped by accident.
          </Text>
          <View style={styles.actions}>
            <PressableScale
              onPress={onDiscard}
              haptic="light"
              scale={0.98}
              style={styles.secondaryBtn}
              disabled={saving}
            >
              <Text style={styles.secondaryBtnText}>Discard</Text>
            </PressableScale>
            <PressableScale
              onPress={onConfirm}
              haptic="medium"
              scale={0.98}
              style={styles.primaryBtn}
              disabled={saving}
            >
              <Text style={styles.primaryBtnText}>
                {saving ? 'Saving…' : 'Save'}
              </Text>
            </PressableScale>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      gap: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    headerCenter: { flex: 1, alignItems: 'center' },
    title: { ...typography.titleLarge, color: theme.textPrimary },
    subtitle: {
      ...typography.caption,
      color: theme.textMuted,
      marginTop: 2,
    },
    iconBtn: {
      width: 40,
      height: 40,
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.bgAlt,
    },
    scroll: { flex: 1 },
    scrollContent: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.xl,
    },
    actionTextBtn: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    actionTextBtnLabel: {
      ...typography.bodyMedium,
      fontWeight: '600',
    },
    actionPrimary: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: radius.full,
    },
    actionPrimaryLabel: {
      ...typography.bodyMedium,
      fontWeight: '700',
    },
  });

const makeConfirmStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    sheet: {
      paddingTop: spacing.sm,
      paddingBottom: spacing.xxl,
      paddingHorizontal: spacing.lg,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      overflow: 'hidden',
      ...shadows.lg,
    },
    dragHandle: {
      width: 40,
      height: 4,
      borderRadius: radius.full,
      backgroundColor: theme.border,
      alignSelf: 'center',
      marginBottom: spacing.md,
    },
    title: {
      ...typography.titleLarge,
      color: theme.textPrimary,
      textAlign: 'center',
      marginBottom: spacing.sm,
    },
    intro: {
      ...typography.bodyMedium,
      color: theme.textSecondary,
      textAlign: 'center',
      marginBottom: spacing.lg,
    },
    actions: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    secondaryBtn: {
      flex: 1,
      paddingVertical: spacing.md,
      borderRadius: radius.full,
      alignItems: 'center',
      backgroundColor: theme.bgAlt,
    },
    secondaryBtnText: {
      ...typography.bodyMedium,
      color: theme.textPrimary,
      fontWeight: '600',
    },
    primaryBtn: {
      flex: 1,
      paddingVertical: spacing.md,
      borderRadius: radius.full,
      alignItems: 'center',
      backgroundColor: theme.accent,
    },
    primaryBtnText: {
      ...typography.bodyMedium,
      color: '#fff',
      fontWeight: '700',
    },
  });
