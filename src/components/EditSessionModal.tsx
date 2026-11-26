import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Alert,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from './SafeAreaView';
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
import { arabicLabelLines } from '../lib/platformUi';
import { ModalNest, useModalHold } from './v2/modalTurn';
import { removeAheadPages } from '../lib/aheadCredit';
import { t } from '../i18n';

interface EditSessionModalProps {
  visible: boolean;
  onClose: () => void;
  log: RevisionLog;
  quranData: QuranPage[];
  sessionPages: number[];
  /**
   * Pages done for the log's day that another session holds (lib/aheadCredit heldElsewhere): Home's review shows
   * them checked like its own, and never copies them into this log (SESS-4, AHEAD-6).
   */
  held?: readonly number[];
  /** `released`: the held pages unchecked here, whose credit to the day the caller takes back (takeBackCredit). */
  onSave: (updatedLog: RevisionLog, released: number[]) => void;
  onDelete: () => void;
}

const NONE: readonly number[] = [];

/** Every page `log` holds as revised: its pagesRevised and the pages it credits to other days (SESS-7's catch-up pages are only credited). */
function heldByLog(log: RevisionLog): number[] {
  return [...log.pagesRevised, ...Object.values(log.ahead ?? {}).flat()];
}

export function EditSessionModal({
  visible,
  onClose,
  log,
  quranData,
  sessionPages,
  held = NONE,
  onSave,
  onDelete,
}: EditSessionModalProps) {
  const { isDark } = useTheme();
  const haptics = useHaptics();
  const { user, pages } = useApp();
  const smartTrackingEnabled = user?.smartTrackingEnabled ?? false;
  // Sheets wait for it (v2/modalTurn); its own menu and rating sheets show over it.
  useModalHold(visible);

  // Every page done starts checked (SESS-4): the log's own, its catch-up pages, and the ones other sessions hold.
  const [revisedPages, setRevisedPages] = useState<Set<number>>(
    () => new Set([...heldByLog(log), ...held]),
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
      setRevisedPages(new Set([...heldByLog(log), ...held]));
      setCurrentPageNumber(sessionPages[0] ?? 1);
    }
  }, [visible, log.id, sessionPages, held]);

  // Save current edits then close — no separate Save button. Tapping X is the
  // commit action; if the user really wants to discard, they can use the
  // delete option in the overflow menu.
  const handleCloseWithSave = () => {
    const weaknessUpdatesArray = Array.from(localRatings.entries()).map(
      ([page, rating]) => ({ page, rating }),
    );
    // A page another session holds stays there (AHEAD-6): unchecked, its credit to the day is taken back; checked,
    // nothing changes. A catch-up page stays out of pagesRevised (SESS-7): unchecked, it leaves the log's credit.
    const heldSet = new Set(held);
    const catchUp = new Set(Object.values(log.ahead ?? {}).flat().filter((p) => !log.pagesRevised.includes(p)));
    const unchecked = heldByLog(log).filter((p) => !revisedPages.has(p));
    onSave(
      {
        ...log,
        pagesRevised: Array.from(revisedPages).filter((p) => !heldSet.has(p) && !catchUp.has(p)),
        pagesSkipped: sessionPages.filter((p) => !revisedPages.has(p)),
        weaknessUpdates: weaknessUpdatesArray,
        ...(log.ahead ? { ahead: removeAheadPages(log.ahead, unchecked) } : {}),
      },
      held.filter((p) => !revisedPages.has(p)),
    );
    onClose();
  };

  const handleDelete = () => {
    Alert.alert(t('revision.edit.deleteTitle'), t('revision.edit.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: onDelete },
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
        label: t('revision.edit.rate'),
        icon: 'stats-chart-outline',
        onPress: () => setSelectedPageForRating(currentPageNumber),
      });
    }
    actions.push({
      key: 'delete',
      label: t('revision.edit.delete'),
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
      <ModalNest>
        <SafeAreaView style={[styles.container, { backgroundColor: read.pageBg }]} testID="edit-session">
          <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

          <View style={[styles.topBar, { backgroundColor: read.pageBg }]}>
            <RoundButton icon="close" label={t('revision.edit.closeAndSave')} onPress={handleCloseWithSave} palette={read} />
            <View style={styles.spacer} />
            <RoundButton
              icon={isCurrentRevised ? 'checkmark' : 'checkmark-outline'}
              label={isCurrentRevised ? t('revision.edit.unmarkCurrent') : t('revision.edit.markCurrent')}
              onPress={toggleCurrent}
              palette={read}
              active={isCurrentRevised}
            />
            <RoundButton icon="ellipsis-horizontal" label={t('revision.edit.menu')} onPress={() => setMenuOpen(true)} palette={read} />
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
                {t('revision.edit.crumb', { juz, hizb })}
              </Text>
              <View style={styles.crumbRight}>
                {firstSurah?.name ? (
                  <Text style={crumbText} maxFontSizeMultiplier={1.3}>
                    {firstSurah.name}
                  </Text>
                ) : null}
                {firstSurah?.nameArabic ? (
                  <Text style={[arabicV2(13), { color: read.textSecondary }]} maxFontSizeMultiplier={1.3} numberOfLines={arabicLabelLines}>
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
      </ModalNest>
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
