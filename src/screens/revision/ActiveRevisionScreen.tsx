import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { HomeStackParamList } from '../../navigation/MainNavigator';
import { Button } from '../../components/Button';
import { ProgressBar } from '../../components/ProgressBar';
import { QuranPageViewer } from '../../components/QuranPageViewer';
import { BulkActionsModal } from '../../components/BulkActionsModal';
import { WeaknessModal } from '../../components/WeaknessRating';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { generateDailyAssignment } from '../../lib/algorithm';
import { getQuranData } from '../../lib/quranData';

type NavigationProp = NativeStackNavigationProp<HomeStackParamList, 'ActiveRevision'>;

export default function ActiveRevisionScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { user, pages, updatePages, addLog } = useApp();
  const { theme } = useTheme();

  const [completedPages, setCompletedPages] = useState<Set<number>>(new Set());
  const [weakPages, setWeakPages] = useState<Set<number>>(new Set());
  // LOCAL ratings state - updates UI immediately
  const [localRatings, setLocalRatings] = useState<Map<number, number>>(new Map());
  const [selectedPageForRating, setSelectedPageForRating] = useState<number | null>(null);
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [currentPageNumber, setCurrentPageNumber] = useState<number | null>(null);
  const [sessionStartTime] = useState(Date.now());

  const assignment = useMemo(() => {
    if (!user) return null;
    const quranData = getQuranData();
    return generateDailyAssignment(pages, quranData, user);
  }, [user, pages]);

  if (!user || !assignment) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const quranData = getQuranData();

  // Prepare page data for the viewer - use local ratings if available, otherwise context
  const viewerPages = assignment.pages.map(pageNum => {
    const page = pages.find(p => p.pageNumber === pageNum);
    // Local rating takes precedence over context rating
    const rating = localRatings.has(pageNum)
      ? localRatings.get(pageNum)!
      : (page?.weaknessRating ?? 4);
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
    const newCompleted = new Set(completedPages);
    newCompleted.add(pageNumber);
    setCompletedPages(newCompleted);
  };

  const handlePageUncomplete = (pageNumber: number) => {
    const newCompleted = new Set(completedPages);
    newCompleted.delete(pageNumber);
    setCompletedPages(newCompleted);
  };

  const handleTogglePage = (pageNumber: number) => {
    if (completedPages.has(pageNumber)) {
      handlePageUncomplete(pageNumber);
    } else {
      handlePageComplete(pageNumber);
    }
  };

  const handleMarkAllComplete = () => {
    setCompletedPages(new Set(assignment.pages));
  };

  const handleMarkAllIncomplete = () => {
    setCompletedPages(new Set());
  };

  const handleMarkJuzComplete = (juzNumber: number) => {
    const juzPages = assignment.pages.filter(pageNum => {
      const quranPage = quranData.find(q => q.pageNumber === pageNum);
      return quranPage?.juzNumber === juzNumber;
    });

    const newCompleted = new Set(completedPages);
    const allJuzCompleted = juzPages.every(p => completedPages.has(p));

    if (allJuzCompleted) {
      // Unmark all pages in this juz
      juzPages.forEach(p => newCompleted.delete(p));
    } else {
      // Mark all pages in this juz
      juzPages.forEach(p => newCompleted.add(p));
    }

    setCompletedPages(newCompleted);
  };

  const handleRatePage = (pageNumber: number) => {
    setSelectedPageForRating(pageNumber);
  };

  const handleEndSession = async () => {
    if (completedCount === 0) {
      Alert.alert(
        'No pages revised',
        'You haven\'t marked any pages as revised. Are you sure you want to end the session?',
        [
          { text: 'Continue Revising', style: 'cancel' },
          { text: 'End Session', style: 'destructive', onPress: submitSession },
        ]
      );
    } else {
      submitSession();
    }
  };

  const submitSession = async () => {
    const durationMinutes = Math.round((Date.now() - sessionStartTime) / (1000 * 60));
    const pagesRevised = Array.from(completedPages);
    const pagesSkipped = assignment.pages.filter(p => !completedPages.has(p));

    // Track which pages actually changed
    const changedPageNumbers = [...pagesRevised, ...pagesSkipped];

    // Update pages with revision data
    const updatedPages = pages.map(p => {
      if (pagesRevised.includes(p.pageNumber)) {
        return {
          ...p,
          lastRevisedDate: new Date().toISOString(),
          totalRevisionCount: p.totalRevisionCount + 1,
          skipCount: 0,
        };
      }
      if (pagesSkipped.includes(p.pageNumber)) {
        return {
          ...p,
          skipCount: p.skipCount + 1,
        };
      }
      return p;
    });

    // Only update if there are changed pages
    if (changedPageNumbers.length > 0) {
      await updatePages(updatedPages, changedPageNumbers);
    }

    // Only create log entry if pages were actually revised
    if (pagesRevised.length > 0) {
      // Convert local ratings map to array format for logging
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
    }

    navigation.goBack();
  };

  // Get current juz dynamically based on current page being viewed
  const displayPageNumber = currentPageNumber || assignment.pages[0];
  const currentJuz = quranData.find(q => q.pageNumber === displayPageNumber)?.juzNumber || 1;
  const currentSurah = quranData.find(q => q.pageNumber === displayPageNumber)?.surahName || '';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
          <Ionicons name="arrow-back" size={24} color={theme.textPrimary} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>
            Juz {currentJuz}
          </Text>
          <Text style={[styles.headerSubtitle, { color: theme.textSecondary }]}>
            Page {displayPageNumber}
          </Text>
        </View>

        <TouchableOpacity onPress={() => setShowBulkActions(true)} style={styles.headerButton}>
          <Ionicons name="list" size={24} color={theme.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Progress bar */}
      <View style={[styles.progressSection, { borderBottomColor: theme.border }]}>
        <View style={styles.progressHeader}>
          <Text style={[styles.progressLabel, { color: theme.textSecondary }]}>
            {completedCount} of {totalPages} pages
          </Text>
          <Text style={[styles.progressPercent, { color: theme.textPrimary }]}>{Math.round(progress)}%</Text>
        </View>
        <ProgressBar progress={progress} height={6} />
      </View>

      {/* Quran Page Viewer */}
      <View style={styles.viewerContainer}>
        <QuranPageViewer
          pages={viewerPages}
          quranData={quranData}
          onPageComplete={handlePageComplete}
          onPageUncomplete={handlePageUncomplete}
          onRatePage={handleRatePage}
          initialPage={assignment.pages[0]}
          onPageChange={setCurrentPageNumber}
        />
      </View>

      {/* Footer */}
      <View style={[styles.footer, { borderTopColor: theme.border, backgroundColor: theme.bg }]}>
        <Button
          title="Submit Session"
          onPress={handleEndSession}
          variant="primary"
          style={styles.submitButton}
        />
      </View>

      {/* Bulk Actions Modal */}
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

      {/* Weakness Rating Modal */}
      {selectedPageForRating && (
        <WeaknessModal
          pageNumber={selectedPageForRating}
          surahName={quranData.find(q => q.pageNumber === selectedPageForRating)?.surahName || ''}
          currentRating={
            localRatings.has(selectedPageForRating)
              ? localRatings.get(selectedPageForRating)
              : pages.find(p => p.pageNumber === selectedPageForRating)?.weaknessRating
          }
          onSave={(rating, applyToJuz) => {
            // Update LOCAL state immediately for instant UI feedback
            const newLocalRatings = new Map(localRatings);
            if (applyToJuz) {
              const pageJuz = quranData.find(q => q.pageNumber === selectedPageForRating)?.juzNumber;
              if (pageJuz) {
                quranData
                  .filter(q => q.juzNumber === pageJuz)
                  .forEach(q => newLocalRatings.set(q.pageNumber, rating));
              }
            } else {
              newLocalRatings.set(selectedPageForRating, rating);
            }
            setLocalRatings(newLocalRatings);
          }}
          onClose={() => setSelectedPageForRating(null)}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    ...typography.bodyMedium,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  headerButton: {
    padding: spacing.sm,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    ...typography.displaySmall,
  },
  headerSubtitle: {
    ...typography.bodySmall,
    marginTop: 2,
  },
  progressSection: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  progressLabel: {
    ...typography.bodySmall,
  },
  progressPercent: {
    ...typography.bodyMedium,
    fontWeight: '600',
  },
  viewerContainer: {
    flex: 1,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
  },
  submitButton: {
    width: '100%',
  },
});
