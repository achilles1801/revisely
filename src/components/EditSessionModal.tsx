import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Alert,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { ThemeColors } from '../theme/colors';
import { useApp } from '../context/AppContext';
import { typography, fonts } from '../theme/typography';
import { spacing } from '../theme/spacing';
import { PressableScale } from './PressableScale';
import { MushafPager } from './MushafPager';
import { WeaknessModal } from './WeaknessRating';
import { SessionMenuSheet, SessionMenuAction } from './revision/SessionMenuSheet';
import { RevisionLog, QuranPage } from '../types';
import {
  getHizbForPage,
  getJuzForPage,
  getSurahsForPage,
} from '../lib/quranData';

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
  const { theme, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { user, pages } = useApp();
  const smartTrackingEnabled = user?.smartTrackingEnabled ?? false;

  const [revisedPages, setRevisedPages] = useState<Set<number>>(
    new Set(log.pagesRevised),
  );
  const [selectedPageForRating, setSelectedPageForRating] = useState<number | null>(null);
  const [localRatings, setLocalRatings] = useState<Map<number, number>>(new Map());
  const [currentPageNumber, setCurrentPageNumber] = useState<number>(
    sessionPages[0] ?? 1,
  );
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (visible) {
      const ratingsMap = new Map<number, number>();
      log.weaknessUpdates?.forEach((wu) => ratingsMap.set(wu.page, wu.rating));
      setLocalRatings(ratingsMap);
      setRevisedPages(new Set(log.pagesRevised));
      setCurrentPageNumber(sessionPages[0] ?? 1);
    }
  }, [visible, log.id, sessionPages]);

  // Save current edits then close — no separate Save button. Tapping X is the
  // commit action; if the user really wants to discard, they can use the
  // delete option in the overflow menu.
  const handleCloseWithSave = () => {
    const weaknessUpdatesArray = Array.from(localRatings.entries()).map(
      ([page, rating]) => ({ page, rating }),
    );
    onSave({
      ...log,
      pagesRevised: Array.from(revisedPages),
      pagesSkipped: sessionPages.filter((p) => !revisedPages.has(p)),
      weaknessUpdates: weaknessUpdatesArray,
    });
    onClose();
  };

  const handleDelete = () => {
    Alert.alert('Delete session?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onDelete },
    ]);
  };

  const isCurrentRevised = revisedPages.has(currentPageNumber);
  const toggleCurrent = () => {
    setRevisedPages((prev) => {
      const next = new Set(prev);
      if (next.has(currentPageNumber)) next.delete(currentPageNumber);
      else next.add(currentPageNumber);
      return next;
    });
  };

  const juz = getJuzForPage(currentPageNumber);
  const hizb = getHizbForPage(currentPageNumber);
  const firstSurah = getSurahsForPage(currentPageNumber)[0];

  const extraData = useMemo(
    () => Array.from(revisedPages).sort().join(','),
    [revisedPages],
  );

  const menuActions: SessionMenuAction[] = useMemo(() => {
    const actions: SessionMenuAction[] = [];
    if (smartTrackingEnabled) {
      actions.push({
        key: 'rate',
        label: 'Rate strength for this page',
        icon: 'stats-chart-outline',
        onPress: () => setSelectedPageForRating(currentPageNumber),
      });
    }
    actions.push({
      key: 'delete',
      label: 'Delete session',
      icon: 'trash-outline',
      destructive: true,
      onPress: handleDelete,
    });
    return actions;
  }, [smartTrackingEnabled, currentPageNumber]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleCloseWithSave}
    >
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

        {/* Top bar — matches SessionBar's monochrome styling, no center text. */}
        <View style={styles.topBar}>
          <PressableScale
            onPress={handleCloseWithSave}
            haptic="light"
            hitSlop={12}
            style={styles.iconBtn}
            accessibilityLabel="Close and save"
          >
            <Ionicons name="close" size={22} color={theme.textPrimary} />
          </PressableScale>

          <View style={styles.spacer} />

          <PressableScale
            onPress={toggleCurrent}
            haptic={isCurrentRevised ? 'light' : 'medium'}
            hitSlop={12}
            style={[
              styles.iconBtn,
              isCurrentRevised && { backgroundColor: theme.textPrimary },
            ]}
            accessibilityLabel={
              isCurrentRevised ? 'Unmark current page' : 'Mark current page as revised'
            }
          >
            <Ionicons
              name={isCurrentRevised ? 'checkmark' : 'checkmark-outline'}
              size={18}
              color={isCurrentRevised ? theme.textInverse : theme.textPrimary}
            />
          </PressableScale>

          <PressableScale
            onPress={() => setMenuOpen(true)}
            haptic="light"
            hitSlop={12}
            style={styles.iconBtn}
            accessibilityLabel="Session menu"
          >
            <Ionicons name="ellipsis-horizontal" size={18} color={theme.textPrimary} />
          </PressableScale>
        </View>

        <View style={styles.viewerWrap}>
          <MushafPager
            pages={sessionPages}
            initialPage={sessionPages[0]}
            onPageChange={setCurrentPageNumber}
            extraData={extraData}
          />

          <View style={styles.breadcrumb} pointerEvents="none">
            <Text style={styles.crumbLeft}>
              Juz {juz} · Hizb {hizb}
            </Text>
            <View style={styles.crumbRight}>
              {firstSurah?.name ? (
                <Text style={styles.crumbSurah}>{firstSurah.name}</Text>
              ) : null}
              {firstSurah?.nameArabic ? (
                <Text style={styles.crumbArabic}>{firstSurah.nameArabic}</Text>
              ) : null}
            </View>
          </View>

          <View style={styles.footer} pointerEvents="none">
            <Text style={styles.pageNum}>{currentPageNumber}</Text>
          </View>
        </View>

        <SessionMenuSheet
          visible={menuOpen}
          actions={menuActions}
          onClose={() => setMenuOpen(false)}
        />

        {smartTrackingEnabled && selectedPageForRating && (
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
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      backgroundColor: theme.bg,
      gap: spacing.xs,
    },
    iconBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    spacer: { flex: 1 },
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
  });
