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
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../../components/GlassCard';
import { PressableScale } from '../../components/PressableScale';
import { MushafPager } from '../../components/MushafPager';
import { useTheme } from '../../context/ThemeContext';
import { ThemeColors } from '../../theme/colors';
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
const READER_GUIDE_DISMISSED_KEY = '@revisley_reader_guide_dismissed';

export default function QuranReaderScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { theme, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const initialPage = route.params.pageNumber;
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [showGuide, setShowGuide] = useState(false);

  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      }, SETTLE_DEBOUNCE_MS);
    },
    [],
  );

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

      <MushafPager
        pages={ALL_PAGES}
        initialPage={initialPage}
        onPageChange={handlePageChange}
      />

      <View style={styles.topBar} pointerEvents="box-none">
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={22} color={theme.textSecondary} />
        </Pressable>
        <Text style={styles.crumbLeft}>
          Juz {juz} · Hizb {hizb}
        </Text>
        <View style={styles.crumbRight}>
          <Text style={styles.crumbSurah}>{firstSurah?.name ?? ''}</Text>
          {firstSurah?.nameArabic ? (
            <Text style={styles.crumbArabic}>{firstSurah.nameArabic}</Text>
          ) : null}
        </View>
        <Pressable
          onPress={() => setShowGuide(true)}
          hitSlop={12}
          style={styles.helpBtn}
          accessibilityLabel="How the reader works"
        >
          <Ionicons name="help" size={16} color={theme.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.footer} pointerEvents="none">
        <Text style={styles.pageNum}>{currentPage}</Text>
      </View>

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
      body: 'Swipe right-to-left to advance through the Mushaf, just like a physical book.',
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

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.bg,
    },
    topBar: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      flexDirection: 'row',
      alignItems: 'center',
      // Extra top padding pushes the chrome below the notch / Dynamic Island
      // instead of crowding the status bar. SafeAreaView already insets a
      // bit, but on phones with bigger top safe areas the chrome still felt
      // squished against the time/battery row.
      paddingTop: spacing.xxl + spacing.md,
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
      color: theme.textPrimary,
      flex: 1,
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
      bottom: 0,
      paddingBottom: spacing.xl,
      alignItems: 'center',
    },
    pageNum: {
      // Smaller and brighter — matches the goal Mushaf page number which
      // sits in the same ink color as the verse text, not muted-gray.
      fontSize: 13,
      fontWeight: '500',
      color: theme.textPrimary,
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
