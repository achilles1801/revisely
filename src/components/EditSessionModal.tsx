import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Alert,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { ThemeColors } from '../theme/colors';
import { useApp } from '../context/AppContext';
import { typography } from '../theme/typography';
import { spacing } from '../theme/spacing';
import { Button } from './Button';
import { PressableScale } from './PressableScale';
import { QuranPageViewer } from './QuranPageViewer';
import { WeaknessModal } from './WeaknessRating';
import { RevisionLog, QuranPage } from '../types';
import { formatDateReadable } from '../lib/utils';

interface EditSessionModalProps {
  visible: boolean;
  onClose: () => void;
  log: RevisionLog;
  quranData: QuranPage[];
  sessionPages: number[];
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
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { pages } = useApp();
  const [revisedPages, setRevisedPages] = useState<Set<number>>(
    new Set(log.pagesRevised),
  );
  const [selectedPageForRating, setSelectedPageForRating] = useState<number | null>(null);
  const [localRatings, setLocalRatings] = useState<Map<number, number>>(new Map());

  useEffect(() => {
    if (visible) {
      const ratingsMap = new Map<number, number>();
      log.weaknessUpdates?.forEach((wu) => ratingsMap.set(wu.page, wu.rating));
      setLocalRatings(ratingsMap);
      setRevisedPages(new Set(log.pagesRevised));
    }
  }, [visible, log.id]);

  const viewerPages = useMemo(() => {
    return sessionPages.map((pageNum) => {
      const page = pages.find((p) => p.pageNumber === pageNum);
      const rating = localRatings.has(pageNum)
        ? localRatings.get(pageNum)!
        : log.weaknessUpdates?.find((wu) => wu.page === pageNum)?.rating ??
          page?.weaknessRating ??
          4;
      return {
        pageNumber: pageNum,
        isCompleted: revisedPages.has(pageNum),
        weaknessRating: rating,
      };
    });
  }, [sessionPages, revisedPages, localRatings, log.weaknessUpdates, pages]);

  const handlePageComplete = (pageNumber: number) => {
    setRevisedPages((prev) => new Set(prev).add(pageNumber));
  };

  const handlePageUncomplete = (pageNumber: number) => {
    setRevisedPages((prev) => {
      const next = new Set(prev);
      next.delete(pageNumber);
      return next;
    });
  };

  const handleSave = () => {
    const weaknessUpdatesArray = Array.from(localRatings.entries()).map(
      ([page, rating]) => ({
        page,
        rating,
      }),
    );
    onSave({
      ...log,
      pagesRevised: Array.from(revisedPages),
      pagesSkipped: sessionPages.filter((p) => !revisedPages.has(p)),
      weaknessUpdates: weaknessUpdatesArray,
    });
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete session?',
      'This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: onDelete },
      ],
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
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <PressableScale
            onPress={onClose}
            haptic="light"
            style={styles.headerButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={24} color={theme.textPrimary} />
          </PressableScale>
          <View style={styles.headerCenter}>
            <Text style={styles.title}>Edit session</Text>
            <Text style={styles.subtitle}>{formatDateReadable(sessionDate)}</Text>
          </View>
          <PressableScale
            onPress={handleDelete}
            haptic="light"
            style={styles.headerButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Delete session"
          >
            <Ionicons name="trash-outline" size={22} color={theme.error} />
          </PressableScale>
        </View>

        <View style={styles.summaryBar}>
          <Text style={styles.summaryText}>
            {completedCount} of {totalCount} pages marked revised
          </Text>
        </View>

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

        <View style={styles.footer}>
          <Button
            title="Save changes"
            onPress={handleSave}
            variant="primary"
            style={{ width: '100%' }}
          />
        </View>

        {selectedPageForRating && (
          <WeaknessModal
            pageNumber={selectedPageForRating}
            surahName={
              quranData.find((q) => q.pageNumber === selectedPageForRating)
                ?.surahName || ''
            }
            currentRating={
              localRatings.has(selectedPageForRating)
                ? localRatings.get(selectedPageForRating)
                : log.weaknessUpdates?.find((wu) => wu.page === selectedPageForRating)?.rating ??
                  pages.find((p) => p.pageNumber === selectedPageForRating)?.weaknessRating
            }
            onSave={(rating, applyToJuz) => {
              const next = new Map(localRatings);
              if (applyToJuz) {
                const pageJuz = quranData.find(
                  (q) => q.pageNumber === selectedPageForRating,
                )?.juzNumber;
                if (pageJuz) {
                  quranData
                    .filter((q) => q.juzNumber === pageJuz)
                    .forEach((q) => {
                      if (sessionPages.includes(q.pageNumber))
                        next.set(q.pageNumber, rating);
                    });
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
    </Modal>
  );
}

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.sm,
    },
    headerButton: {
      width: 40,
      height: 40,
      borderRadius: 999,
      backgroundColor: theme.bgAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerCenter: { flex: 1, alignItems: 'center' },
    title: { ...typography.titleMedium, color: theme.textPrimary },
    subtitle: {
      ...typography.bodySmall,
      color: theme.textSecondary,
      marginTop: 2,
    },
    summaryBar: {
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
      backgroundColor: theme.bgAlt,
      marginHorizontal: spacing.md,
      borderRadius: 999,
      alignSelf: 'center',
      marginTop: spacing.xs,
    },
    summaryText: {
      ...typography.bodySmall,
      color: theme.textSecondary,
      textAlign: 'center',
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
