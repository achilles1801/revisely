import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsFocused, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../../components/GlassCard';
import { PressableScale } from '../../components/PressableScale';
import { MushafPager, MushafPagerHandle } from '../../components/MushafPager';
import { MushafScrubber } from '../../components/MushafScrubber';
import { useVerseActions } from '../../components/verse/useVerseActions';
import { navigateToActivityDay } from '../../navigation/navigationRef';
import { UndoToast } from '../../components/revision/UndoToast';
import { RecordButton } from '../../components/recordings/RecordButton';
import { useVoiceRecorder } from '../../hooks/useVoiceRecorder';
import { useKeepScreenOn } from '../../hooks/useKeepScreenOn';
import { useRevisionDay } from '../../hooks/useRevisionDay';
import { useApp } from '../../context/AppContext';
import { useFloatingTimerOffset } from '../../components/timer/floatingTimerOffset';
import { TimerChip } from '../../components/timer/TimerChip';
import { ReaderFrame } from '../../components/reader/ReaderFrame';
import { ReaderActivity } from '../../components/reader/ReaderActivity';
import { CAPSULE_HEIGHT, PlayerCapsule } from '../../components/reader/PlayerCapsule';
import { useReaderChrome } from '../../components/reader/useReaderChrome';
import { RoundButton } from '../../components/reader/RoundButton';
import { useReadingTimer } from '../../context/ReadingTimerContext';
import { useTheme } from '../../context/ThemeContext';
import { ThemeColors } from '../../theme/colors';
import { getReadPalette, ReadPalette } from '../../theme/readPalette';
import { typography, fonts } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { shadows } from '../../theme/shadows';
import {
  getHizbForPage,
  getJuzForPage,
  getSurahsForPage,
} from '../../lib/quranData';
import { appendReadingHistory } from '../../lib/readingHistory';
import type { ReadStackParamList } from '../../navigation/MainNavigator';

type NavigationProp = NativeStackNavigationProp<ReadStackParamList, 'QuranReader'>;
type RouteProps = RouteProp<ReadStackParamList, 'QuranReader'>;

const ALL_PAGES: number[] = Array.from({ length: 604 }, (_, i) => i + 1);
const SETTLE_DEBOUNCE_MS = 1500;
// Under the page, with the controls: the position track, then the capsule.
const SCRUBBER_HEIGHT = 32;
const FOOTER_HEIGHT = SCRUBBER_HEIGHT + spacing.xs + CAPSULE_HEIGHT + spacing.sm;
const READER_GUIDE_DISMISSED_KEY = '@revisley_reader_guide_dismissed';

export default function QuranReaderScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { theme, isDark } = useTheme();
  const palette = getReadPalette(isDark);
  const styles = useMemo(() => makeStyles(palette), [palette]);

  const initialPage = route.params.pageNumber;
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [showGuide, setShowGuide] = useState(false);

  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pagerRef = useRef<MushafPagerHandle>(null);
  const { timer, notePage } = useReadingTimer();
  // Hold a verse: highlight, Play (Husary), Translation. Recitation turns pages.
  // Record yourself reading; saved under today's (revision day's) reading.
  const { user } = useApp();
  const { day: today } = useRevisionDay(user);
  // After ending a recording: "Recording saved · View" (opens it in Activity).
  const [savedRecording, setSavedRecording] = useState<{ day: string; recordingId: string } | null>(
    null,
  );
  const recorder = useVoiceRecorder({
    kind: 'reading',
    day: today,
    currentPage,
    onFinished: setSavedRecording,
  });

  // Opened again with another page while already open (e.g. the Friday
  // Al-Kahf card): the stack updates this screen's params instead of pushing.
  const requestedPage = route.params.pageNumber;
  const lastRequestedRef = useRef(requestedPage);
  useEffect(() => {
    if (requestedPage === lastRequestedRef.current) return;
    lastRequestedRef.current = requestedPage;
    pagerRef.current?.scrollToPage(requestedPage);
  }, [requestedPage]);

  // Reading or revising without touching the screen: don't let it lock.
  const isScreenFocused = useIsFocused();
  useKeepScreenOn(isScreenFocused);

  const verseActions = useVerseActions({
    pages: ALL_PAGES,
    onShowPage: (page) => pagerRef.current?.scrollToPage(page),
    currentPage,
  });

  // Reading: nothing but the page (its number, the juz and surah). A tap on
  // the page brings the controls (they sit beside the page, never over it);
  // another tap, or turning the page, puts them away.
  const chrome = useReaderChrome();
  // The timer is in the controls here, not floating over the page.
  useFloatingTimerOffset('hidden');
  const { width } = useWindowDimensions();

  useEffect(() => {
    AsyncStorage.getItem(READER_GUIDE_DISMISSED_KEY).then((v) => {
      if (v !== 'true') setShowGuide(true);
    });
  }, []);

  const dismissGuideForever = async () => {
    setShowGuide(false);
    await AsyncStorage.setItem(READER_GUIDE_DISMISSED_KEY, 'true');
  };

  const handlePageChange = useCallback(
    (pageNumber: number) => {
      setCurrentPage(pageNumber);
      if (settleTimer.current) clearTimeout(settleTimer.current);
      settleTimer.current = setTimeout(() => {
        appendReadingHistory(pageNumber);
        notePage(pageNumber);
      }, SETTLE_DEBOUNCE_MS);
    },
    [notePage],
  );

  // The pager reports the jump through onPageChange, so history and the
  // timer's page credit work exactly as they do for a swipe.
  const handleJump = useCallback((pageNumber: number) => {
    pagerRef.current?.scrollToPage(pageNumber);
  }, []);

  // Credit the page the reader opened on (and the current page whenever a
  // session starts while reading).
  const timerRunning = timer?.runningSince != null;
  useEffect(() => {
    if (timerRunning) notePage(currentPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerRunning]);

  useEffect(() => {
    appendReadingHistory(initialPage);
    return () => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
    };
  }, [initialPage]);

  const juz = getJuzForPage(currentPage);
  const hizb = getHizbForPage(currentPage);
  const firstSurah = getSurahsForPage(currentPage)[0];

  // Previous / next go when the capsule is crowded (a recording, a timer) on
  // anything narrower than the largest phones.
  const crowded = recorder.phase !== 'idle' || timer != null;
  const compact = width < 430 && crowded;

  return (
    <View style={styles.container}>
      <ReaderFrame
        chromeVisible={chrome.visible}
        background={palette.pageBg}
        isDark={isDark}
        quietHeader={
          <View style={styles.quietHeader}>
            <Text style={styles.quietText} numberOfLines={1}>
              Juz {juz}
            </Text>
            <SurahName surah={firstSurah} palette={palette} quiet />
          </View>
        }
        header={
          <View style={styles.header}>
            <RoundButton icon="chevron-back" label="Back" onPress={() => navigation.goBack()} palette={palette} />
            <View style={styles.titleCol}>
              <SurahName surah={firstSurah} palette={palette} />
              <Text style={styles.subtitle} numberOfLines={1}>
                Page {currentPage} · Juz {juz} · Hizb {hizb}
              </Text>
            </View>
            <RoundButton icon="help" label="How the reader works" onPress={() => setShowGuide(true)} palette={palette} />
          </View>
        }
        footer={
          <View style={styles.footer}>
            <MushafScrubber page={currentPage} onJump={handleJump} palette={palette} />
            <PlayerCapsule
              player={verseActions.player}
              page={currentPage}
              compact={compact}
              surface={{ background: palette.card, border: palette.divider }}
              record={
                <RecordButton
                  recorder={recorder}
                  color={palette.textSecondary}
                  background={palette.card}
                  border={palette.divider}
                />
              }
              timer={<TimerChip />}
            />
          </View>
        }
        footerHeight={FOOTER_HEIGHT}
        pageLabel={<Text style={styles.pageNum}>{currentPage}</Text>}
        activity={
          <ReaderActivity recorder={recorder} playback={verseActions.player.state} onPress={chrome.show} />
        }
      >
        <MushafPager
          ref={pagerRef}
          pages={ALL_PAGES}
          initialPage={initialPage}
          onPageChange={handlePageChange}
          onLongPressAyah={verseActions.onLongPressAyah}
          highlightedAyah={verseActions.highlightedAyah}
          onTap={chrome.toggle}
          onUserSwipe={chrome.hide}
        />
      </ReaderFrame>

      <UndoToast
        visible={!!savedRecording}
        message="Recording saved"
        actionLabel="View"
        duration={6000}
        onUndo={() => {
          const saved = savedRecording;
          setSavedRecording(null);
          if (saved) navigateToActivityDay(saved.day, saved.recordingId);
        }}
        onDismiss={() => setSavedRecording(null)}
        bottomInset={FOOTER_HEIGHT}
      />

      {verseActions.overlay}

      <ReaderGuideModal
        visible={showGuide}
        onClose={dismissGuideForever}
        theme={theme}
      />
    </View>
  );
}

/** The surah on the page: its name, and its name in Arabic. */
function SurahName({
  surah,
  palette,
  quiet,
}: {
  surah: ReturnType<typeof getSurahsForPage>[number] | undefined;
  palette: ReadPalette;
  quiet?: boolean;
}) {
  if (!surah) return null;
  const color = quiet ? palette.textSecondary : palette.textPrimary;
  return (
    <View style={surahStyles.row}>
      <Text style={[quiet ? surahStyles.quiet : surahStyles.title, { color }]} numberOfLines={1}>
        {surah.name}
      </Text>
      {surah.nameArabic ? (
        <Text style={[surahStyles.arabic, { color, fontSize: quiet ? 13 : 16 }]} numberOfLines={1}>
          {surah.nameArabic}
        </Text>
      ) : null}
    </View>
  );
}

const surahStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs, flexShrink: 1 },
  title: { ...typography.titleSmall },
  quiet: { ...typography.caption },
  arabic: { fontFamily: fonts.arabic },
});

function ReaderGuideModal({
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
      title: 'Swipe to turn pages',
      body: 'Swipe right-to-left to advance through the Mushaf, just like a physical book. Drag the bar at the bottom to jump anywhere — page 1 is at the right.',
    },
    {
      icon: 'finger-print-outline',
      title: 'Tap the page for the controls',
      body: 'While you read there is only the page. Tap it to show the controls (play, record, the timer, the page bar); tap again, or turn the page, to put them away.',
    },
    {
      icon: 'hand-left-outline',
      title: 'Hold a verse',
      body: 'Press and hold any verse to hear it recited or read its translation. ▶ in the controls recites from the top of the page.',
    },
    {
      icon: 'mic-outline',
      title: 'Record yourself',
      body: 'Tap the mic in the controls to record your recitation. Tap the time to pause or resume, and ■ to stop. Find recordings in Activity.',
    },
    {
      icon: 'time-outline',
      title: 'Your place is remembered',
      body: 'The last few pages you read show up under Recent on the Surahs index, so you can pick up where you left off.',
    },
    {
      icon: 'shield-checkmark-outline',
      title: 'Reading here doesn’t count as revision',
      body: 'The Read tab is for free reading — it doesn’t affect your revision schedule or strength ratings. Use the Home tab when you want a tracked session.',
    },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.card}>
          <GlassCard style={StyleSheet.absoluteFillObject} />
          <View style={styles.headerRow}>
            <Text style={styles.title}>How the reader works</Text>
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

const makeStyles = (palette: ReadPalette) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: palette.pageBg,
    },
    quietHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      gap: spacing.md,
    },
    quietText: {
      ...typography.caption,
      color: palette.textSecondary,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.sm,
      gap: spacing.sm,
    },
    titleCol: { flex: 1, alignItems: 'center' },
    subtitle: {
      ...typography.caption,
      color: palette.textSecondary,
    },
    footer: {
      flex: 1,
      paddingHorizontal: spacing.sm,
      paddingBottom: spacing.sm,
      gap: spacing.xs,
      justifyContent: 'flex-end',
    },
    pageNum: {
      textAlign: 'center',
      // Small, in the page's ink colour, like the printed mushaf's number.
      fontSize: 13,
      fontWeight: '500',
      fontVariant: ['tabular-nums'],
      color: palette.textPrimary,
    },
  });

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
