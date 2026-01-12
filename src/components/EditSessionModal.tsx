import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Alert,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useApp } from '../context/AppContext';
import { typography } from '../theme/typography';
import { spacing } from '../theme/spacing';
import { Button } from './Button';
import { QuranPageViewer } from './QuranPageViewer';
import { WeaknessModal } from './WeaknessRating';
import { RevisionLog, QuranPage } from '../types';
import { formatDateReadable } from '../lib/utils';

interface EditSessionModalProps {
  visible: boolean;
  onClose: () => void;
  log: RevisionLog;
  quranData: QuranPage[];
  sessionPages: number[]; // Only the pages that were part of this session's assignment
  onSave: (updatedLog: RevisionLog) => void;
  onDelete: () => void;
}

export function EditSessionModal({
  visible,
  onClose,
  log,
  quranData,
  sessionPages,
  onSave,
  onDelete,
}: EditSessionModalProps) {
  const { theme } = useTheme();
  const { pages } = useApp();
  const [revisedPages, setRevisedPages] = useState<Set<number>>(new Set(log.pagesRevised));
  const [selectedPageForRating, setSelectedPageForRating] = useState<number | null>(null);
  // Local ratings state - tracks rating changes in this edit session
  const [localRatings, setLocalRatings] = useState<Map<number, number>>(new Map());

  // Initialize local ratings from log's weaknessUpdates when modal opens
  useEffect(() => {
    if (visible) {
      const ratingsMap = new Map<number, number>();
      if (log.weaknessUpdates) {
        log.weaknessUpdates.forEach(wu => {
          ratingsMap.set(wu.page, wu.rating);
        });
      }
      setLocalRatings(ratingsMap);
    }
  }, [visible, log.id]);

  // Prepare pages for the viewer - only show pages from this session
  const viewerPages = useMemo(() => {
    return sessionPages.map(pageNum => {
      // Use local rating if available, otherwise try log's weaknessUpdates, then pages context, then default
      const page = pages.find(p => p.pageNumber === pageNum);
      const rating = localRatings.has(pageNum)
        ? localRatings.get(pageNum)!
        : (log.weaknessUpdates?.find(wu => wu.page === pageNum)?.rating ?? page?.weaknessRating ?? 4);
      return {
        pageNumber: pageNum,
        isCompleted: revisedPages.has(pageNum),
        weaknessRating: rating,
      };
    });
  }, [sessionPages, revisedPages, localRatings, log.weaknessUpdates, pages]);

  const handlePageComplete = (pageNumber: number) => {
    const newRevised = new Set(revisedPages);
    newRevised.add(pageNumber);
    setRevisedPages(newRevised);
  };

  const handlePageUncomplete = (pageNumber: number) => {
    const newRevised = new Set(revisedPages);
    newRevised.delete(pageNumber);
    setRevisedPages(newRevised);
  };

  const handleSave = () => {
    // Convert local ratings map to array format for logging
    const weaknessUpdatesArray = Array.from(localRatings.entries()).map(([page, rating]) => ({
      page,
      rating,
    }));
    
    const updatedLog: RevisionLog = {
      ...log,
      pagesRevised: Array.from(revisedPages),
      pagesSkipped: sessionPages.filter(p => !revisedPages.has(p)),
      weaknessUpdates: weaknessUpdatesArray,
    };
    onSave(updatedLog);
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Session',
      'Are you sure you want to delete this revision session? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: onDelete },
      ]
    );
  };

  const sessionDate = new Date(log.date);
  const completedCount = revisedPages.size;
  const totalCount = sessionPages.length;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <TouchableOpacity onPress={onClose} style={styles.headerButton}>
            <Ionicons name="close" size={24} color={theme.textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={[styles.title, { color: theme.textPrimary }]}>Edit Session</Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              {formatDateReadable(sessionDate)}
            </Text>
          </View>
          <TouchableOpacity onPress={handleDelete} style={styles.headerButton}>
            <Ionicons name="trash-outline" size={22} color={theme.error} />
          </TouchableOpacity>
        </View>

        {/* Summary bar */}
        <View style={[styles.summaryBar, { backgroundColor: theme.bgAlt }]}>
          <Text style={[styles.summaryText, { color: theme.textSecondary }]}>
            {completedCount} of {totalCount} pages marked as revised
          </Text>
        </View>

        {/* Quran Page Viewer */}
        <View style={styles.viewerContainer}>
          <QuranPageViewer
            pages={viewerPages}
            quranData={quranData}
            onPageComplete={handlePageComplete}
            onPageUncomplete={handlePageUncomplete}
            onRatePage={setSelectedPageForRating}
            initialPage={sessionPages[0]}
          />
        </View>

        {/* Footer */}
        <View style={[styles.footer, { borderTopColor: theme.border, backgroundColor: theme.bg }]}>
          <Button
            title="Save Changes"
            onPress={handleSave}
            variant="primary"
            style={styles.saveButton}
          />
        </View>

        {/* Weakness Rating Modal */}
        {selectedPageForRating && (
          <WeaknessModal
            pageNumber={selectedPageForRating}
            surahName={quranData.find(q => q.pageNumber === selectedPageForRating)?.surahName || ''}
            currentRating={
              localRatings.has(selectedPageForRating)
                ? localRatings.get(selectedPageForRating)
                : (log.weaknessUpdates?.find(wu => wu.page === selectedPageForRating)?.rating ?? 
                    pages.find(p => p.pageNumber === selectedPageForRating)?.weaknessRating)
            }
            onSave={(rating, applyToJuz) => {
              // Update LOCAL state immediately for instant UI feedback
              const newLocalRatings = new Map(localRatings);
              if (applyToJuz) {
                const pageJuz = quranData.find(q => q.pageNumber === selectedPageForRating)?.juzNumber;
                if (pageJuz) {
                  quranData
                    .filter(q => q.juzNumber === pageJuz)
                    .forEach(q => {
                      // Only update pages that are part of this session
                      if (sessionPages.includes(q.pageNumber)) {
                        newLocalRatings.set(q.pageNumber, rating);
                      }
                    });
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
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  headerButton: {
    padding: spacing.sm,
    minWidth: 44,
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    ...typography.bodyLarge,
    fontWeight: '600',
  },
  subtitle: {
    ...typography.bodySmall,
    marginTop: 2,
  },
  summaryBar: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  summaryText: {
    ...typography.bodySmall,
    textAlign: 'center',
  },
  viewerContainer: {
    flex: 1,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
  },
  saveButton: {
    width: '100%',
  },
});
