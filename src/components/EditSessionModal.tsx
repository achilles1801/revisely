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
import { useTheme } from '../context/ThemeContext';
import { useApp } from '../context/AppContext';
import { spacing } from '../theme/spacing';
import { MushafPager } from './MushafPager';
import { WeaknessModal } from './WeaknessRating';
import { SessionMenuSheet, SessionMenuAction } from './revision/SessionMenuSheet';
import { RevisionLog, QuranPage } from '../types';
import { useHaptics } from '../design/haptics';
import { RoundButton } from './reader/RoundButton';
import { getReadPalette } from '../theme/readPalette';
import { arabicV2, layoutV2, typeV2 } from '../theme/v2';
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
  const { isDark } = useTheme();
  const haptics = useHaptics();
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
    haptics.selection();
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

  // The session's page colours and its bare header icons
  // (components/reader/RoundButton), the page marked revised the "done" check.
  const read = getReadPalette(isDark);
  const crumbText = [typeV2.meta, { color: read.textSecondary }];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleCloseWithSave}
    >
      <SafeAreaView style={[styles.container, { backgroundColor: read.pageBg }]} testID="edit-session">
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

        <View style={[styles.topBar, { backgroundColor: read.pageBg }]}>
          <RoundButton icon="close" label="Close and save" onPress={handleCloseWithSave} palette={read} />
          <View style={styles.spacer} />
          <RoundButton
            icon={isCurrentRevised ? 'checkmark' : 'checkmark-outline'}
            label={isCurrentRevised ? 'Unmark current page' : 'Mark current page as revised'}
            onPress={toggleCurrent}
            palette={read}
            active={isCurrentRevised}
          />
          <RoundButton icon="ellipsis-horizontal" label="Session menu" onPress={() => setMenuOpen(true)} palette={read} />
        </View>

        <View style={styles.viewerWrap}>
          <MushafPager
            pages={sessionPages}
            initialPage={sessionPages[0]}
            onPageChange={setCurrentPageNumber}
            extraData={extraData}
          />

          <View style={styles.breadcrumb} pointerEvents="none">
            <Text style={crumbText} maxFontSizeMultiplier={1.3}>
              Juz {juz} · Hizb {hizb}
            </Text>
            <View style={styles.crumbRight}>
              {firstSurah?.name ? (
                <Text style={crumbText} maxFontSizeMultiplier={1.3}>
                  {firstSurah.name}
                </Text>
              ) : null}
              {firstSurah?.nameArabic ? (
                <Text style={[arabicV2(13), { color: read.textSecondary }]} maxFontSizeMultiplier={1.3}>
                  {firstSurah.nameArabic}
                </Text>
              ) : null}
            </View>
          </View>

          <View style={styles.footer} pointerEvents="none">
            <Text
              style={[typeV2.meta, typeV2.numeral, { color: read.textPrimary }]}
              maxFontSizeMultiplier={1.3}
              testID="edit-session-page"
            >
              {currentPageNumber}
            </Text>
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

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: layoutV2.gutter - 6,
    paddingVertical: spacing.xs,
    gap: 8,
  },
  spacer: { flex: 1 },
  viewerWrap: { flex: 1 },
  breadcrumb: {
    position: 'absolute',
    top: spacing.sm,
    left: layoutV2.gutter,
    right: layoutV2.gutter,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  crumbRight: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: spacing.md,
    alignItems: 'center',
  },
});
