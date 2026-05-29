import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  Modal,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { HomeStackParamList } from '../../navigation/MainNavigator';
import { Button } from '../../components/Button';
import { GlassCard } from '../../components/GlassCard';
import { PressableScale } from '../../components/PressableScale';
import { MushafPager } from '../../components/MushafPager';
import { BulkActionsModal } from '../../components/BulkActionsModal';
import { TranslationSheet } from '../../components/TranslationSheet';
import { WeaknessModal } from '../../components/WeaknessRating';
import { SessionBar } from '../../components/revision/SessionBar';
import { SessionMenuSheet, SessionMenuAction } from '../../components/revision/SessionMenuSheet';
import { UndoToast } from '../../components/revision/UndoToast';
import { typography, fonts } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { shadows } from '../../theme/shadows';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { ThemeColors } from '../../theme/colors';
import { generateDailyAssignment, getCurrentRevisionDay } from '../../lib/algorithm';
import {
  getHizbForPage,
  getQuranData,
  getSurahsForPage,
} from '../../lib/quranData';
import { logger } from '../../lib/logger';

const AUTO_SAVE_INTERVAL_MS = 5000;
const REVISION_GUIDE_DISMISSED_KEY = '@revisley_revision_guide_dismissed';

type NavigationProp = NativeStackNavigationProp<HomeStackParamList, 'ActiveRevision'>;

export default function ActiveRevisionScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { user, pages, logs, updatePages, addLog, loadData, error } = useApp();
  const { theme, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const smartTrackingEnabled = user?.smartTrackingEnabled ?? false;

  const assignment = useMemo(() => {
    if (!user) return null;
    const quranData = getQuranData();
    return generateDailyAssignment(pages, quranData, user);
  }, [user, pages]);

  const alreadyRevisedToday = useMemo(() => {
    if (!assignment) return new Set<number>();
    const today = getCurrentRevisionDay(user);
    const assignmentSet = new Set(assignment.pages);
    const revised = new Set<number>();
    for (const log of logs) {
      if (log.date !== today) continue;
      for (const p of log.pagesRevised) {
        if (assignmentSet.has(p)) revised.add(p);
      }
    }
    return revised;
  }, [logs, assignment, user]);

  const ratingsFromTodaysLogs = useMemo(() => {
    const map = new Map<number, number>();
    if (!smartTrackingEnabled) return map;
    const today = getCurrentRevisionDay(user);
    for (const log of logs) {
      if (log.date !== today) continue;
      for (const wu of log.weaknessUpdates) map.set(wu.page, wu.rating);
    }
    return map;
  }, [logs, smartTrackingEnabled, user]);

  const [completedPages, setCompletedPages] = useState<Set<number>>(
    () => new Set(alreadyRevisedToday),
  );
  const [localRatings, setLocalRatings] = useState<Map<number, number>>(
    () => new Map(ratingsFromTodaysLogs),
  );
  const [currentPageNumber, setCurrentPageNumber] = useState<number | null>(null);
  const [sessionStartTime] = useState(Date.now());
  const [saving, setSaving] = useState(false);

  const [menuOpen, setMenuOpen] = useState(false);
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [showRating, setShowRating] = useState(false);
  const [undoState, setUndoState] = useState<{
    page: number;
    message: string;
  } | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(REVISION_GUIDE_DISMISSED_KEY).then((v) => {
      if (v !== 'true') setShowGuide(true);
    });
  }, []);

  const silentlySavedRef = useRef<Set<number>>(new Set(alreadyRevisedToday));
  const lastSaveTimeRef = useRef<number>(sessionStartTime);
  const commitInFlightRef = useRef(false);

  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    };
  }, []);

  const commitPendingPages = useCallback(async (): Promise<void> => {
    if (!user || !assignment) return;
    if (commitInFlightRef.current) return;
    const pending = Array.from(completedPages).filter(
      (p) => !silentlySavedRef.current.has(p),
    );
    if (pending.length === 0) return;
    commitInFlightRef.current = true;
    try {
      const durationMinutes = Math.max(
        1,
        Math.round((Date.now() - lastSaveTimeRef.current) / 60_000),
      );
      const updatedPages = pages.map((p) =>
        pending.includes(p.pageNumber)
          ? {
              ...p,
              lastRevisedDate: new Date().toISOString(),
              totalRevisionCount: p.totalRevisionCount + 1,
              skipCount: 0,
            }
          : p,
      );
      await updatePages(updatedPages, pending);
      const weaknessUpdates = Array.from(localRatings.entries())
        .filter(([page]) => pending.includes(page))
        .map(([page, rating]) => ({ page, rating }));
      await addLog({
        date: getCurrentRevisionDay(user),
        assignedPages: assignment.pages,
        pagesRevised: pending,
        pagesSkipped: [],
        weaknessUpdates,
        durationMinutes,
      });
      pending.forEach((p) => silentlySavedRef.current.add(p));
      lastSaveTimeRef.current = Date.now();
    } catch (err) {
      logger.error('Auto-save failed', err);
    } finally {
      commitInFlightRef.current = false;
    }
  }, [user, assignment, completedPages, pages, localRatings, updatePages, addLog]);

  useEffect(() => {
    const id = setInterval(() => {
      commitPendingPages();
    }, AUTO_SAVE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [commitPendingPages]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        commitPendingPages();
      }
    });
    return () => sub.remove();
  }, [commitPendingPages]);

  if (!user || !assignment) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          {error ? (
            <>
              <Text style={styles.errorTitle}>Couldn't load your session</Text>
              <Text style={styles.errorMessage}>{error}</Text>
              <Button
                title="Try again"
                onPress={loadData}
                variant="primary"
                style={styles.retryButton}
              />
            </>
          ) : (
            <Text style={styles.loadingText}>Loading…</Text>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const quranData = getQuranData();
  const totalPages = assignment.pages.length;
  const completedCount = completedPages.size;

  const resumePage =
    assignment.pages.find((p) => !alreadyRevisedToday.has(p)) ??
    assignment.pages[0];
  const displayPageNumber = currentPageNumber || resumePage;
  const currentJuz = quranData.find((q) => q.pageNumber === displayPageNumber)?.juzNumber || 1;
  const currentHizb = getHizbForPage(displayPageNumber);
  const firstSurahOnPage = getSurahsForPage(displayPageNumber)[0];

  const isCurrentRevised = completedPages.has(displayPageNumber);

  const scopeLabel = useMemo(() => {
    // Prefer juz scope when the assignment fits one juz; otherwise show count.
    const juzes = new Set(
      assignment.pages
        .map((p) => quranData.find((q) => q.pageNumber === p)?.juzNumber)
        .filter((j): j is number => typeof j === 'number'),
    );
    if (juzes.size === 1) return `Juz ${[...juzes][0]}`;
    return `${assignment.pages.length} pages`;
  }, [assignment.pages, quranData]);

  // ===== Mark / unmark =====

  const markRevised = useCallback(
    (pageNumber: number) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setCompletedPages((prev) => {
        if (prev.has(pageNumber)) return prev;
        const next = new Set(prev);
        next.add(pageNumber);
        return next;
      });
    },
    [],
  );

  const unmarkRevised = useCallback((pageNumber: number) => {
    setCompletedPages((prev) => {
      if (!prev.has(pageNumber)) return prev;
      const next = new Set(prev);
      next.delete(pageNumber);
      return next;
    });
  }, []);

  const handleToggleCurrent = () => {
    if (isCurrentRevised) unmarkRevised(displayPageNumber);
    else markRevised(displayPageNumber);
  };

  // ===== Swipe-to-credit =====

  const handleAdvance = useCallback(
    (leftPage: number, _currentPage: number) => {
      if (!assignment.pages.includes(leftPage)) return;
      if (completedPages.has(leftPage)) return;
      markRevised(leftPage);
      if (undoTimer.current) clearTimeout(undoTimer.current);
      setUndoState({
        page: leftPage,
        message: `Page ${leftPage} marked as revised`,
      });
    },
    [assignment.pages, completedPages, markRevised],
  );

  const handleUndo = () => {
    if (!undoState) return;
    unmarkRevised(undoState.page);
    setUndoState(null);
  };

  // ===== End session =====

  const submitSession = useCallback(async () => {
    await commitPendingPages();
    const pagesRevised = Array.from(completedPages).filter(
      (p) => !silentlySavedRef.current.has(p),
    );
    const pagesSkipped = assignment.pages.filter(
      (p) => !completedPages.has(p) && !silentlySavedRef.current.has(p),
    );
    const changedPageNumbers = [...pagesRevised, ...pagesSkipped];

    const updatedPages = pages.map((p) => {
      if (pagesRevised.includes(p.pageNumber)) {
        return {
          ...p,
          lastRevisedDate: new Date().toISOString(),
          totalRevisionCount: p.totalRevisionCount + 1,
          skipCount: 0,
        };
      }
      if (pagesSkipped.includes(p.pageNumber)) {
        return { ...p, skipCount: p.skipCount + 1 };
      }
      return p;
    });

    if (changedPageNumbers.length > 0) {
      await updatePages(updatedPages, changedPageNumbers);
    }

    if (pagesRevised.length > 0) {
      const durationDelta = Math.max(
        0,
        Math.round((Date.now() - lastSaveTimeRef.current) / 60_000),
      );
      const weaknessUpdatesArray = Array.from(localRatings.entries()).map(
        ([page, rating]) => ({ page, rating }),
      );
      await addLog({
        date: getCurrentRevisionDay(user),
        assignedPages: assignment.pages,
        pagesRevised,
        pagesSkipped,
        weaknessUpdates: weaknessUpdatesArray,
        durationMinutes: durationDelta,
      });
      pagesRevised.forEach((p) => silentlySavedRef.current.add(p));
      lastSaveTimeRef.current = Date.now();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    navigation.goBack();
  }, [
    commitPendingPages,
    completedPages,
    assignment.pages,
    pages,
    updatePages,
    localRatings,
    addLog,
    user,
    navigation,
  ]);

  const handleEndSession = () => {
    if (completedCount === 0) {
      Alert.alert(
        'No pages revised',
        "You haven't marked any pages. End the session anyway?",
        [
          { text: 'Continue', style: 'cancel' },
          { text: 'End session', style: 'destructive', onPress: submitSession },
        ],
      );
    } else {
      submitSession();
    }
  };

  const handleSaveAndBack = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await commitPendingPages();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } finally {
      setSaving(false);
      navigation.goBack();
    }
  };

  const dismissGuideForever = async () => {
    setShowGuide(false);
    await AsyncStorage.setItem(REVISION_GUIDE_DISMISSED_KEY, 'true');
  };

  // ===== Bulk-action handlers (used inside BulkActionsModal) =====

  const handleMarkAllComplete = () => setCompletedPages(new Set(assignment.pages));
  const handleMarkAllIncomplete = () => setCompletedPages(new Set());
  const handleMarkJuzComplete = (juzNumber: number) => {
    const juzPages = assignment.pages.filter((pageNum) => {
      const quranPage = quranData.find((q) => q.pageNumber === pageNum);
      return quranPage?.juzNumber === juzNumber;
    });
    setCompletedPages((prev) => {
      const next = new Set(prev);
      const allDone = juzPages.every((p) => next.has(p));
      juzPages.forEach((p) => (allDone ? next.delete(p) : next.add(p)));
      return next;
    });
  };
  const handleTogglePage = (pageNumber: number) => {
    if (completedPages.has(pageNumber)) unmarkRevised(pageNumber);
    else markRevised(pageNumber);
  };

  // ===== Menu actions =====

  const menuActions: SessionMenuAction[] = [
    {
      key: 'translation',
      label: 'View translation',
      icon: 'language-outline',
      onPress: () => setShowTranslation(true),
    },
    ...(smartTrackingEnabled
      ? [
          {
            key: 'rate',
            label: 'Rate page strength',
            icon: 'fitness-outline' as const,
            onPress: () => setShowRating(true),
          },
        ]
      : []),
    {
      key: 'bulk',
      label: 'Jump or mark in bulk',
      icon: 'list-outline',
      onPress: () => setShowBulkActions(true),
    },
    {
      key: 'guide',
      label: 'How revision works',
      icon: 'help-circle-outline',
      onPress: () => setShowGuide(true),
    },
    {
      key: 'save',
      label: saving ? 'Saving…' : 'Save and exit',
      icon: 'save-outline',
      onPress: handleSaveAndBack,
    },
    {
      key: 'end',
      label: 'End session',
      icon: 'flag-outline',
      destructive: true,
      onPress: handleEndSession,
    },
  ];

  const viewerPages = useMemo(
    () => assignment.pages,
    [assignment.pages],
  );

  // Force re-render of the pager's extraData when revision state of any page
  // changes (so any overlay can update). We don't actually render an overlay
  // per page right now, but keeping this hook in place makes that cheap to
  // add later.
  const extraData = useMemo(
    () => Array.from(completedPages).sort().join(','),
    [completedPages],
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <SessionBar
        scopeLabel={scopeLabel}
        revisedCount={completedCount}
        totalCount={totalPages}
        isCurrentPageRevised={isCurrentRevised}
        onBack={handleSaveAndBack}
        onToggleCurrent={handleToggleCurrent}
        onOverflow={() => setMenuOpen(true)}
      />

      <View style={styles.viewerWrap}>
        <MushafPager
          pages={viewerPages}
          initialPage={resumePage}
          onPageChange={setCurrentPageNumber}
          onAdvance={handleAdvance}
          extraData={extraData}
        />

        <View style={styles.breadcrumb} pointerEvents="none">
          <Text style={styles.crumbLeft}>
            Juz {currentJuz} · Hizb {currentHizb}
          </Text>
          <View style={styles.crumbRight}>
            {firstSurahOnPage?.name ? (
              <Text style={styles.crumbSurah}>{firstSurahOnPage.name}</Text>
            ) : null}
            {firstSurahOnPage?.nameArabic ? (
              <Text style={styles.crumbArabic}>{firstSurahOnPage.nameArabic}</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.footer} pointerEvents="none">
          <Text style={styles.pageNum}>{displayPageNumber}</Text>
        </View>
      </View>

      {/* All revised → submit button slides up */}
      {completedCount === totalPages && totalPages > 0 && (
        <View style={styles.submitWrap}>
          <GlassCard style={StyleSheet.absoluteFillObject} />
          <Button
            title="Submit session"
            onPress={handleEndSession}
            variant="primary"
            style={{ width: '100%' }}
          />
        </View>
      )}

      <UndoToast
        visible={!!undoState}
        message={undoState?.message ?? ''}
        onUndo={handleUndo}
        onDismiss={() => setUndoState(null)}
        bottomInset={spacing.xl}
      />

      <SessionMenuSheet
        visible={menuOpen}
        actions={menuActions}
        onClose={() => setMenuOpen(false)}
      />

      <TranslationSheet
        visible={showTranslation}
        pageNumber={displayPageNumber}
        onClose={() => setShowTranslation(false)}
      />

      <BulkActionsModal
        visible={showBulkActions}
        onClose={() => setShowBulkActions(false)}
        pages={viewerPages.map((pageNum) => ({
          pageNumber: pageNum,
          isCompleted: completedPages.has(pageNum),
          weaknessRating: localRatings.get(pageNum) ?? 4,
        }))}
        quranData={quranData}
        onMarkAllComplete={handleMarkAllComplete}
        onMarkAllIncomplete={handleMarkAllIncomplete}
        onMarkJuzComplete={handleMarkJuzComplete}
        onTogglePage={handleTogglePage}
      />

      <RevisionGuideModal
        visible={showGuide}
        onClose={dismissGuideForever}
        theme={theme}
      />

      {smartTrackingEnabled && showRating && (
        <WeaknessModal
          pageNumber={displayPageNumber}
          surahName={
            quranData.find((q) => q.pageNumber === displayPageNumber)?.surahName ||
            ''
          }
          currentRating={
            localRatings.has(displayPageNumber)
              ? localRatings.get(displayPageNumber)
              : pages.find((p) => p.pageNumber === displayPageNumber)?.weaknessRating
          }
          onSave={(rating, applyToJuz) => {
            const next = new Map(localRatings);
            if (applyToJuz) {
              const pageJuz = quranData.find(
                (q) => q.pageNumber === displayPageNumber,
              )?.juzNumber;
              if (pageJuz) {
                quranData
                  .filter((q) => q.juzNumber === pageJuz)
                  .forEach((q) => next.set(q.pageNumber, rating));
              }
            } else {
              next.set(displayPageNumber, rating);
            }
            setLocalRatings(next);
          }}
          onClose={() => setShowRating(false)}
        />
      )}
    </SafeAreaView>
  );
}

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
    },
    loadingText: { ...typography.bodyMedium, color: theme.textSecondary },
    errorTitle: {
      ...typography.titleLarge,
      color: theme.textPrimary,
      marginBottom: spacing.xs,
      textAlign: 'center',
    },
    errorMessage: {
      ...typography.bodyMedium,
      color: theme.textSecondary,
      marginBottom: spacing.xl,
      textAlign: 'center',
    },
    retryButton: { minWidth: 160 },
    viewerWrap: { flex: 1 },
    breadcrumb: {
      position: 'absolute',
      top: spacing.sm,
      left: spacing.md,
      right: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    crumbLeft: {
      ...typography.caption,
      color: theme.textPrimary,
    },
    crumbRight: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: spacing.xs,
    },
    crumbSurah: {
      ...typography.caption,
      color: theme.textPrimary,
    },
    crumbArabic: {
      fontFamily: fonts.arabic,
      fontSize: 14,
      color: theme.textPrimary,
    },
    footer: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: spacing.md,
      alignItems: 'center',
    },
    pageNum: {
      fontSize: 13,
      fontWeight: '500',
      color: theme.textPrimary,
    },
    submitWrap: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.md,
      overflow: 'hidden',
    },
  });

function RevisionGuideModal({
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
      icon: 'book-outline',
      title: 'Swipe through pages',
      body: 'Swipe right-to-left to advance to the next page in your session.',
    },
    {
      icon: 'arrow-forward-circle-outline',
      title: 'Swipe = done',
      body: 'Swiping forward auto-credits the page you just left as revised. You can undo from the toast that appears, or tap the checkmark in the top bar to toggle the current page by hand.',
    },
    {
      icon: 'ellipsis-horizontal-circle-outline',
      title: 'More in the menu',
      body: 'Open (⋮) for translation, bulk marking, and — if Smart Tracking is on — rating page strength. End session lives there too.',
    },
    {
      icon: 'save-outline',
      title: 'Saved as you go',
      body: 'Your marks save automatically every few seconds and when you leave the app, so nothing is lost if you exit mid-session.',
    },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.card}>
          <GlassCard style={StyleSheet.absoluteFillObject} />
          <View style={styles.headerRow}>
            <Text style={styles.title}>How revision works</Text>
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
    title: { ...typography.titleLarge, color: theme.textPrimary },
    closeBtn: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.full,
    },
    steps: { gap: spacing.md, marginBottom: spacing.lg },
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
