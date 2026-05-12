import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { HomeStackParamList } from '../../navigation/MainNavigator';
import { Button } from '../../components/Button';
import { ProgressBar } from '../../components/ProgressBar';
import { PressableScale } from '../../components/PressableScale';
import { QuranPageViewer } from '../../components/QuranPageViewer';
import { BulkActionsModal } from '../../components/BulkActionsModal';
import { WeaknessModal } from '../../components/WeaknessRating';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { ThemeColors } from '../../theme/colors';
import { generateDailyAssignment } from '../../lib/algorithm';
import { getQuranData } from '../../lib/quranData';

type NavigationProp = NativeStackNavigationProp<HomeStackParamList, 'ActiveRevision'>;

export default function ActiveRevisionScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { user, pages, logs, updatePages, addLog, loadData, error } = useApp();
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const assignment = useMemo(() => {
    if (!user) return null;
    const quranData = getQuranData();
    return generateDailyAssignment(pages, quranData, user);
  }, [user, pages]);

  // Pages already revised today that are part of this assignment — used to
  // resume the session from where the user left off.
  const alreadyRevisedToday = useMemo(() => {
    if (!assignment) return new Set<number>();
    const today = new Date().toISOString().split('T')[0];
    const assignmentSet = new Set(assignment.pages);
    const revised = new Set<number>();
    for (const log of logs) {
      if (log.date !== today) continue;
      for (const p of log.pagesRevised) {
        if (assignmentSet.has(p)) revised.add(p);
      }
    }
    return revised;
  }, [logs, assignment]);

  // Ratings the user has already saved today — replayed so the session resumes
  // with the same weakness rating they last picked.
  const ratingsFromTodaysLogs = useMemo(() => {
    const map = new Map<number, number>();
    const today = new Date().toISOString().split('T')[0];
    for (const log of logs) {
      if (log.date !== today) continue;
      for (const wu of log.weaknessUpdates) map.set(wu.page, wu.rating);
    }
    return map;
  }, [logs]);

  const [completedPages, setCompletedPages] = useState<Set<number>>(
    () => new Set(alreadyRevisedToday),
  );
  const [localRatings, setLocalRatings] = useState<Map<number, number>>(
    () => new Map(ratingsFromTodaysLogs),
  );
  const [selectedPageForRating, setSelectedPageForRating] = useState<number | null>(null);
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [currentPageNumber, setCurrentPageNumber] = useState<number | null>(null);
  const [sessionStartTime] = useState(Date.now());

  if (!user || !assignment) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          {error ? (
            <>
              <Text style={styles.errorTitle}>Couldn't load your session</Text>
              <Text style={styles.errorMessage}>{error}</Text>
              <Button title="Try again" onPress={loadData} variant="primary" style={styles.retryButton} />
            </>
          ) : (
            <Text style={styles.loadingText}>Loading…</Text>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const quranData = getQuranData();
  const viewerPages = assignment.pages.map((pageNum) => {
    const page = pages.find((p) => p.pageNumber === pageNum);
    const rating = localRatings.has(pageNum)
      ? localRatings.get(pageNum)!
      : page?.weaknessRating ?? 4;
    return {
      pageNumber: pageNum,
      isCompleted: completedPages.has(pageNum),
      weaknessRating: rating,
    };
  });

  const completedCount = completedPages.size;
  const totalPages = assignment.pages.length;
  const progress = totalPages > 0 ? (completedCount / totalPages) * 100 : 0;

  const handlePageComplete = (pageNumber: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCompletedPages((prev) => new Set(prev).add(pageNumber));
  };

  const handlePageUncomplete = (pageNumber: number) => {
    setCompletedPages((prev) => {
      const next = new Set(prev);
      next.delete(pageNumber);
      return next;
    });
  };

  const handleTogglePage = (pageNumber: number) => {
    if (completedPages.has(pageNumber)) handlePageUncomplete(pageNumber);
    else handlePageComplete(pageNumber);
  };

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

  const submitSession = async () => {
    const durationMinutes = Math.round((Date.now() - sessionStartTime) / (1000 * 60));
    // Exclude pages already revised in a prior session today so we don't
    // re-credit revisions or accidentally mark them as skipped.
    const pagesRevised = Array.from(completedPages).filter(
      (p) => !alreadyRevisedToday.has(p),
    );
    const pagesSkipped = assignment.pages.filter(
      (p) => !completedPages.has(p) && !alreadyRevisedToday.has(p),
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
      const weaknessUpdatesArray = Array.from(localRatings.entries()).map(([page, rating]) => ({
        page,
        rating,
      }));
      await addLog({
        date: new Date().toISOString().split('T')[0],
        pagesRevised,
        pagesSkipped,
        weaknessUpdates: weaknessUpdatesArray,
        durationMinutes: durationMinutes || 1,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    navigation.goBack();
  };

  // Resume at the first page that isn't already done; fall back to page 1 of
  // the assignment if everything is somehow already complete.
  const resumePage =
    assignment.pages.find((p) => !alreadyRevisedToday.has(p)) ??
    assignment.pages[0];
  const displayPageNumber = currentPageNumber || resumePage;
  const currentJuz = quranData.find((q) => q.pageNumber === displayPageNumber)?.juzNumber || 1;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <PressableScale
          onPress={() => navigation.goBack()}
          haptic="light"
          style={styles.headerButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={24} color={theme.textPrimary} />
        </PressableScale>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Juz {currentJuz}</Text>
          <Text style={styles.headerSubtitle}>Page {displayPageNumber}</Text>
        </View>

        <PressableScale
          onPress={() => setShowBulkActions(true)}
          haptic="light"
          style={styles.headerButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Bulk actions"
        >
          <Ionicons name="ellipsis-horizontal" size={22} color={theme.textPrimary} />
        </PressableScale>
      </View>

      <View style={styles.progressSection}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressLabel}>
            {completedCount} of {totalPages} pages
          </Text>
          <Text style={styles.progressPercent}>{Math.round(progress)}%</Text>
        </View>
        <ProgressBar progress={progress} height={6} />
      </View>

      <View style={styles.viewerContainer}>
        <QuranPageViewer
          pages={viewerPages}
          quranData={quranData}
          onPageComplete={handlePageComplete}
          onPageUncomplete={handlePageUncomplete}
          onRatePage={setSelectedPageForRating}
          initialPage={resumePage}
          onPageChange={setCurrentPageNumber}
        />
      </View>

      <View style={styles.footer}>
        <Button
          title={completedCount === totalPages ? 'Complete session' : 'Submit session'}
          onPress={handleEndSession}
          variant="primary"
          style={{ width: '100%' }}
        />
      </View>

      <BulkActionsModal
        visible={showBulkActions}
        onClose={() => setShowBulkActions(false)}
        pages={viewerPages}
        quranData={quranData}
        onMarkAllComplete={handleMarkAllComplete}
        onMarkAllIncomplete={handleMarkAllIncomplete}
        onMarkJuzComplete={handleMarkJuzComplete}
        onTogglePage={handleTogglePage}
      />

      {selectedPageForRating && (
        <WeaknessModal
          pageNumber={selectedPageForRating}
          surahName={quranData.find((q) => q.pageNumber === selectedPageForRating)?.surahName || ''}
          currentRating={
            localRatings.has(selectedPageForRating)
              ? localRatings.get(selectedPageForRating)
              : pages.find((p) => p.pageNumber === selectedPageForRating)?.weaknessRating
          }
          onSave={(rating, applyToJuz) => {
            const next = new Map(localRatings);
            if (applyToJuz) {
              const pageJuz = quranData.find((q) => q.pageNumber === selectedPageForRating)?.juzNumber;
              if (pageJuz) {
                quranData
                  .filter((q) => q.juzNumber === pageJuz)
                  .forEach((q) => next.set(q.pageNumber, rating));
              }
            } else {
              next.set(selectedPageForRating, rating);
            }
            setLocalRatings(next);
          }}
          onClose={() => setSelectedPageForRating(null)}
        />
      )}
    </SafeAreaView>
  );
}

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent' },
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
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    headerButton: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 999,
      backgroundColor: theme.bgAlt,
    },
    headerCenter: { flex: 1, alignItems: 'center' },
    headerTitle: { ...typography.titleLarge, color: theme.textPrimary },
    headerSubtitle: { ...typography.bodySmall, color: theme.textSecondary, marginTop: 2 },
    progressSection: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.xs,
      paddingBottom: spacing.md,
    },
    progressHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.xs,
    },
    progressLabel: { ...typography.bodySmall, color: theme.textSecondary },
    progressPercent: {
      ...typography.titleSmall,
      color: theme.accent,
      fontWeight: '700',
    },
    viewerContainer: { flex: 1 },
    footer: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.border,
      backgroundColor: theme.bg,
    },
  });
