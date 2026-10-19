import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
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
import {
  FLOATING_TIMER_SIZE,
  useFloatingTimerOffset,
} from '../../components/timer/floatingTimerOffset';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
// Just above the scrubber and page number at the bottom.
// The bottom bar: tall enough for the player, or the scrubber and page number.
const FOOTER_CONTENT_HEIGHT = 56;
const FOOTER_PADDING_BOTTOM = spacing.sm;
const TIMER_SLOT_IDLE = FLOATING_TIMER_SIZE + spacing.md * 2;
const TIMER_SLOT_RUNNING = 136;
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
  // The "?" only stays around until the guide has been seen once.
  const [guideSeen, setGuideSeen] = useState(true);

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

  // The top bar and the bottom bar (player while reciting, otherwise the
  // scrubber) have their own space; the page fits between them, so nothing
  // covers a verse. Tapping the page hides or shows them (the page doesn't move).
  const [chromeVisible, setChromeVisible] = useState(true);
  const toggleChrome = useCallback(() => setChromeVisible((v) => !v), []);
  const insets = useSafeAreaInsets();
  // The floating timer docks in the bottom bar's right-hand slot; hidden with
  // the controls.
  useFloatingTimerOffset(
    chromeVisible
      ? insets.bottom + FOOTER_PADDING_BOTTOM + (FOOTER_CONTENT_HEIGHT - FLOATING_TIMER_SIZE) / 2
      : 'hidden',
  );

  useEffect(() => {
    AsyncStorage.getItem(READER_GUIDE_DISMISSED_KEY).then((v) => {
      if (v !== 'true') {
        setGuideSeen(false);
        setShowGuide(true);
      }
    });
  }, []);

  const dismissGuideForever = async () => {
    setShowGuide(false);
    setGuideSeen(true);
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

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View
        style={[styles.topBar, !chromeVisible && styles.hidden]}
        pointerEvents={chromeVisible ? 'box-none' : 'none'}
      >
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={22} color={palette.textSecondary} />
        </Pressable>
        <Text style={styles.crumbLeft} numberOfLines={1}>
          Juz {juz} · Hizb {hizb}
        </Text>
        {/* While recording, the recording controls take the surah's place
            (narrow phones have no room for both). */}
        {recorder.phase === 'idle' && (
          <View style={styles.crumbRight}>
            <Text style={styles.crumbSurah} numberOfLines={1}>
              {firstSurah?.name ?? ''}
            </Text>
            {firstSurah?.nameArabic ? (
              <Text style={styles.crumbArabic} numberOfLines={1}>
                {firstSurah.nameArabic}
              </Text>
            ) : null}
          </View>
        )}
        <RecordButton
          recorder={recorder}
          color={palette.textSecondary}
          background={palette.card}
          border={palette.divider}
        />
        {!guideSeen && recorder.phase === 'idle' && (
          <Pressable
            onPress={() => setShowGuide(true)}
            hitSlop={12}
            style={styles.helpBtn}
            accessibilityLabel="How the reader works"
          >
            <Ionicons name="help" size={16} color={palette.textSecondary} />
          </Pressable>
        )}
      </View>

      <View style={styles.pageArea}>
        <MushafPager
          ref={pagerRef}
          pages={ALL_PAGES}
          initialPage={initialPage}
          onPageChange={handlePageChange}
          onLongPressAyah={verseActions.onLongPressAyah}
          highlightedAyah={verseActions.highlightedAyah}
          onTap={toggleChrome}
        />
      </View>

      <View style={styles.footer}>
        <View style={styles.footerContent} pointerEvents={chromeVisible ? 'box-none' : 'none'}>
          {chromeVisible &&
            (verseActions.player ?? (
              <>
                <MushafScrubber page={currentPage} onJump={handleJump} palette={palette} />
                <Text style={styles.pageNum} pointerEvents="none">
                  {currentPage}
                </Text>
              </>
            ))}
        </View>
        {/* The floating timer docks here (wider while it shows a clock). */}
        <View style={{ width: timer ? TIMER_SLOT_RUNNING : TIMER_SLOT_IDLE }} />
      </View>

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
        bottomInset={FOOTER_CONTENT_HEIGHT + FOOTER_PADDING_BOTTOM + spacing.sm}
      />

      {verseActions.overlay}

      <ReaderGuideModal
        visible={showGuide}
        onClose={dismissGuideForever}
        theme={theme}
      />
    </SafeAreaView>
  );
}

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
      icon: 'hand-left-outline',
      title: 'Hold a verse',
      body: 'Press and hold any verse to hear it recited (Al-Husary) or read its translation.',
    },
    {
      icon: 'mic-outline',
      title: 'Record yourself',
      body: 'Tap the mic to record your recitation. Tap the time to pause or resume, and ■ to stop. Recordings stay on this phone; find them in Activity.',
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
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      // SafeAreaView keeps it below the notch / Dynamic Island.
      paddingTop: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.sm,
      gap: spacing.sm,
    },
    backBtn: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    helpBtn: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    crumbLeft: {
      ...typography.caption,
      color: palette.textPrimary,
      flex: 1,
      minWidth: 60,
    },
    crumbRight: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: spacing.xs,
      flexShrink: 1,
    },
    crumbSurah: {
      ...typography.caption,
      color: palette.textPrimary,
    },
    crumbArabic: {
      fontFamily: fonts.arabic,
      fontSize: 14,
      color: palette.textPrimary,
    },
    hidden: { opacity: 0 },
    pageArea: { flex: 1 },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingLeft: spacing.md,
      paddingBottom: FOOTER_PADDING_BOTTOM,
      gap: spacing.xs,
    },
    footerContent: {
      flex: 1,
      height: FOOTER_CONTENT_HEIGHT,
      justifyContent: 'center',
      alignItems: 'stretch',
    },

    pageNum: {
      textAlign: 'center',
      // Smaller and brighter — matches the goal Mushaf page number which
      // sits in the same ink color as the verse text, not muted-gray.
      fontSize: 13,
      fontWeight: '500',
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
