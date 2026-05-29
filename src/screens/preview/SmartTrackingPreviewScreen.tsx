import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  Platform,
  Switch,
  StatusBar,
  Pressable,
  Dimensions,
  Image,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Button } from '../../components/Button';
import { GlassCard } from '../../components/GlassCard';
import { LiquidGlassSegmentedControl } from '../../components/LiquidGlassSegmentedControl';
import { MushafPager } from '../../components/MushafPager';
import { PressableScale } from '../../components/PressableScale';
import { SessionBar } from '../../components/revision/SessionBar';
import { SessionMenuSheet } from '../../components/revision/SessionMenuSheet';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { ThemeColors } from '../../theme/colors';
import { typography, fonts } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { shadows } from '../../theme/shadows';
import { getHizbForPage, getSurahForPage, getQuranData } from '../../lib/quranData';
import { getQuranPageImageUrl } from '../../lib/quranImages';
import { RATINGS, getRatingLabel } from '../../lib/ratings';

const SCREEN_WIDTH = Dimensions.get('window').width;
const FOCUS_ITEM_WIDTH = SCREEN_WIDTH - spacing.lg * 2;

type Step = 'intro' | 'rate' | 'insights' | 'cta' | 'not_now_pointer';

interface Props {
  visible: boolean;
  onClose: () => void;
}

function getStrengthColor(rating: number, theme: ThemeColors): string {
  if (rating <= 1) return theme.error;
  if (rating === 2) return theme.warning;
  if (rating === 3) return theme.gold;
  return theme.accent;
}

export function SmartTrackingPreviewScreen({ visible, onClose }: Props) {
  const { user, pages, saveUser } = useApp();
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const quranData = useMemo(() => getQuranData(), []);

  const [step, setStep] = useState<Step>('intro');
  const [demoRating, setDemoRating] = useState<number | null>(null);
  const [demoMarked, setDemoMarked] = useState(false);
  const [ratingSheetOpen, setRatingSheetOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [previewPageNumber, setPreviewPageNumber] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // Use the user's first memorized page as the demo subject — guaranteed to
  // be Fatihah (page 1) for new users, since onboarding enforces it.
  const demoPage = pages.find((p) => p.status === 'memorized');
  const demoSurah = demoPage ? getSurahForPage(demoPage.pageNumber) : null;
  const demoJuz = useMemo(() => {
    if (!demoPage) return 1;
    return quranData.find((q) => q.pageNumber === demoPage.pageNumber)?.juzNumber ?? 1;
  }, [demoPage, quranData]);

  const reset = () => {
    setStep('intro');
    setDemoRating(null);
    setDemoMarked(false);
    setRatingSheetOpen(false);
    setMenuOpen(false);
    setPreviewPageNumber(null);
  };

  const handleClose = () => {
    // Backing out does NOT mark the preview as seen — glow persists for the
    // next attempt. Only an explicit Enable / Not-now flow sets that flag.
    reset();
    onClose();
  };

  const handleEnable = async () => {
    if (!user || saving) return;
    setSaving(true);
    try {
      await saveUser({
        ...user,
        smartTrackingEnabled: true,
        hasSeenSmartTrackingPreview: true,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      reset();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleNotNow = async () => {
    if (!user || saving) return;
    setSaving(true);
    try {
      await saveUser({
        ...user,
        hasSeenSmartTrackingPreview: true,
      });
      setStep('not_now_pointer');
    } finally {
      setSaving(false);
    }
  };

  const handleGotIt = () => {
    reset();
    onClose();
  };

  const demoHizb = useMemo(
    () => (demoPage ? getHizbForPage(demoPage.pageNumber) : 1),
    [demoPage],
  );

  if (!demoPage || !demoSurah) {
    // Defensive: shouldn't happen in practice since onboarding enforces ≥1
    // memorized page (Fatihah floor). If it does, gracefully no-op.
    return null;
  }

  const renderScrollableStep = (content: React.ReactNode) => (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.scrollContent,
        { paddingBottom: insets.bottom + spacing.lg },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {content}
    </ScrollView>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <LinearGradient
          colors={
            isDark
              ? ['#0F1410', '#1F4538', '#0F1410']
              : ['#FBF8F3', '#C6DDD3', '#FBF8F3']
          }
          locations={[0, 0.5, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>SMART TRACKING PREVIEW</Text>
          </View>
          {step !== 'not_now_pointer' && (
            <PressableScale
              onPress={handleClose}
              haptic="light"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityLabel="Close preview"
            >
              <GlassCard style={styles.closeButton}>
                <Ionicons name="close" size={22} color={theme.textSecondary} />
              </GlassCard>
            </PressableScale>
          )}
        </View>

        {step === 'intro' && renderScrollableStep(<IntroStep theme={theme} styles={styles} />)}

        {step === 'rate' && (
          <View style={styles.rateBody}>
            <SessionBar
              scopeLabel={`Juz ${demoJuz}`}
              revisedCount={demoMarked ? 1 : 0}
              totalCount={1}
              isCurrentPageRevised={demoMarked}
              onBack={() => {}}
              onToggleCurrent={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setDemoMarked((v) => !v);
              }}
              onOverflow={() => setMenuOpen(true)}
            />

            <View style={styles.viewerContainer}>
              <MushafPager
                pages={[demoPage.pageNumber]}
                initialPage={demoPage.pageNumber}
              />

              <View style={styles.previewBreadcrumb} pointerEvents="none">
                <Text style={styles.crumbLeft}>
                  Juz {demoJuz} · Hizb {demoHizb}
                </Text>
                <View style={styles.crumbRight}>
                  <Text style={styles.crumbSurah}>{demoSurah.name}</Text>
                  {demoSurah.nameArabic ? (
                    <Text style={styles.crumbArabic}>{demoSurah.nameArabic}</Text>
                  ) : null}
                </View>
              </View>

              <View style={styles.previewFooter} pointerEvents="none">
                <Text style={styles.previewPageNum}>{demoPage.pageNumber}</Text>
              </View>
            </View>

            {demoRating === null && (
              <View style={styles.rateCoachWrap} pointerEvents="none">
                <View style={styles.rateCoachCaret} />
                <View style={styles.rateCoachBubble}>
                  <Text style={styles.rateCoachText}>Tap (⋮) to rate</Text>
                </View>
              </View>
            )}
          </View>
        )}

        {step === 'rate' && demoRating !== null && (
          <View
            style={[
              styles.bottomCoachWrap,
              { bottom: Math.max(insets.bottom, spacing.md) + 64 },
            ]}
            pointerEvents="none"
          >
            <View style={styles.bottomCoachBubble}>
              <Text style={styles.bottomCoachText}>Save & continue</Text>
            </View>
            <View style={styles.bottomCoachCaret} />
          </View>
        )}

        {step === 'insights' && (
          <View
            style={[
              styles.bottomCoachWrap,
              { bottom: Math.max(insets.bottom, spacing.md) + 64 },
            ]}
            pointerEvents="none"
          >
            <View style={styles.bottomCoachBubble}>
              <Text style={styles.bottomCoachText}>Tap Next to continue</Text>
            </View>
            <View style={styles.bottomCoachCaret} />
          </View>
        )}

        {step === 'insights' &&
          demoRating !== null &&
          renderScrollableStep(
            <InsightsTabMimic
              pageNumber={demoPage.pageNumber}
              surahName={demoSurah.name}
              surahNameArabic={demoSurah.nameArabic}
              rating={demoRating}
              onTapPage={() => setPreviewPageNumber(demoPage.pageNumber)}
              theme={theme}
              isDark={isDark}
              styles={styles}
            />,
          )}

        {step === 'cta' && renderScrollableStep(<CtaStep theme={theme} styles={styles} />)}

        {step === 'not_now_pointer' &&
          renderScrollableStep(<NotNowPointerStep theme={theme} styles={styles} />)}

        <View
          style={[
            styles.footer,
            { paddingBottom: Math.max(insets.bottom, spacing.md) },
          ]}
        >
          <GlassCard style={StyleSheet.absoluteFillObject} />
          {step === 'intro' && (
            <Button
              title="Show me"
              onPress={() => setStep('rate')}
              variant="primary"
              style={styles.fullButton}
            />
          )}

          {step === 'rate' && (
            <Button
              title={demoRating === null ? 'Open the menu (⋮) to rate' : 'Save & continue'}
              onPress={() => setStep('insights')}
              variant="primary"
              disabled={demoRating === null}
              style={styles.fullButton}
            />
          )}

          {step === 'insights' && (
            <Button
              title="Next"
              onPress={() => setStep('cta')}
              variant="primary"
              style={styles.fullButton}
            />
          )}

          {step === 'cta' && (
            <View style={styles.ctaButtons}>
              <Button
                title="Not now"
                onPress={handleNotNow}
                variant="ghost"
                disabled={saving}
                style={styles.halfButton}
              />
              <Button
                title="Enable"
                onPress={handleEnable}
                variant="primary"
                loading={saving}
                style={styles.halfButton}
              />
            </View>
          )}

          {step === 'not_now_pointer' && (
            <Button
              title="Got it"
              onPress={handleGotIt}
              variant="primary"
              style={styles.fullButton}
            />
          )}
        </View>

        <SessionMenuSheet
          visible={menuOpen}
          actions={[
            {
              key: 'rate',
              label: 'Rate page strength',
              icon: 'fitness-outline',
              onPress: () => setRatingSheetOpen(true),
            },
          ]}
          onClose={() => setMenuOpen(false)}
        />

        <SandboxRatingSheet
          visible={ratingSheetOpen}
          pageNumber={demoPage.pageNumber}
          surahName={demoSurah.name}
          currentRating={demoRating ?? undefined}
          onPick={(r) => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setDemoRating(r);
            setRatingSheetOpen(false);
          }}
          onClose={() => setRatingSheetOpen(false)}
          theme={theme}
        />

        <SandboxPagePreviewModal
          pageNumber={previewPageNumber}
          onClose={() => setPreviewPageNumber(null)}
          theme={theme}
          isDark={isDark}
        />
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

function IntroStep({
  theme,
  styles,
}: {
  theme: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
}) {
  const bullets: { icon: keyof typeof Ionicons.glyphMap; text: string }[] = [
    {
      icon: 'pulse-outline',
      text: 'Rate each page after revising so the app learns where you’re shaky.',
    },
    {
      icon: 'sparkles-outline',
      text: 'See a focused list of pages that need your attention most.',
    },
    {
      icon: 'eye-outline',
      text: 'Filter by strength to find weak spots across your memorization.',
    },
  ];

  return (
    <View>
      <View style={styles.iconCircle}>
        <Ionicons name="sparkles" size={32} color={theme.accent} />
      </View>
      <Text style={styles.headline}>Meet Smart Tracking</Text>
      <Text style={styles.subhead}>
        An optional layer that learns your weak spots and surfaces what to
        focus on next. Try it out — nothing is saved.
      </Text>
      <View style={styles.bulletList}>
        {bullets.map((b) => (
          <View key={b.icon} style={styles.bulletRow}>
            <View style={[styles.bulletIcon, { backgroundColor: theme.accent + '20' }]}>
              <Ionicons name={b.icon} size={16} color={theme.accent} />
            </View>
            <Text style={styles.bulletText}>{b.text}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function CoachMark({
  text,
  theme,
  styles,
}: {
  text: string;
  theme: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.coachMark}>
      <View style={[styles.coachDot, { backgroundColor: theme.accent }]} />
      <Text style={styles.coachText}>{text}</Text>
    </View>
  );
}

// Mirrors the real AlgorithmScreen layout: title + subtitle, TODAY'S FOCUS
// card with the rated page, and a BROWSE card with segmented control + filter
// chips + pages list. The focus card and browse row are tappable to open a
// sandbox page preview, matching real-tab behavior.
function InsightsTabMimic({
  pageNumber,
  surahName,
  surahNameArabic,
  rating,
  onTapPage,
  theme,
  isDark,
  styles,
}: {
  pageNumber: number;
  surahName: string;
  surahNameArabic: string;
  rating: number;
  onTapPage: () => void;
  theme: ThemeColors;
  isDark: boolean;
  styles: ReturnType<typeof makeStyles>;
}) {
  const color = getStrengthColor(rating, theme);
  const label = getRatingLabel(rating);
  const reason =
    rating <= 2
      ? 'You marked this as ' + label.toLowerCase()
      : 'Recently rated — keep it fresh';

  return (
    <View>
      {/* Page header — mirrors AlgorithmScreen */}
      <View style={styles.insightsHeader}>
        <Text style={styles.insightsTitle}>Insights</Text>
        <Text style={styles.insightsSubtitle}>
          Where you stand and what to focus on
        </Text>
      </View>

      <CoachMark
        text="This is your Insights tab. Tap the focus card or a browse row to open a page."
        theme={theme}
        styles={styles}
      />

      {/* TODAY'S FOCUS card */}
      <GlassCard
        glassStyle="clear"
        specular
        tintColor={isDark ? 'rgba(0,0,0,0.22)' : 'rgba(0,0,0,0.08)'}
        style={{ ...styles.mimicCard, paddingHorizontal: 0 }}
      >
        <View style={styles.mimicCardHeader}>
          <Text style={styles.mimicCardLabel}>TODAY'S FOCUS</Text>
          <Text style={styles.mimicCardSubtitle}>
            Your top priority right now
          </Text>
        </View>

        <View style={{ width: FOCUS_ITEM_WIDTH, paddingHorizontal: spacing.lg }}>
          <PressableScale onPress={onTapPage} haptic="light" scale={0.98}>
            <GlassCard
              glassStyle="clear"
              style={{ ...styles.focusInner, borderLeftColor: color }}
            >
              <View style={styles.focusHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.focusPageLabel}>Page {pageNumber}</Text>
                  <Text style={styles.focusSurahName}>{surahName}</Text>
                  <Text style={styles.focusSurahArabic}>{surahNameArabic}</Text>
                </View>
                <View
                  style={[
                    styles.strengthBadge,
                    { backgroundColor: color + '20', borderColor: color },
                  ]}
                >
                  <Text style={[styles.strengthBadgeText, { color }]}>
                    {rating}
                  </Text>
                </View>
              </View>
              <View style={styles.focusFooter}>
                <Text style={styles.focusReason}>{reason}</Text>
                <View style={styles.openHint}>
                  <Text style={[styles.openHintText, { color: theme.accent }]}>
                    Open
                  </Text>
                  <Ionicons name="open-outline" size={14} color={theme.accent} />
                </View>
              </View>
            </GlassCard>
          </PressableScale>
        </View>

        <View style={styles.dotRow}>
          <View
            style={[styles.dot, { backgroundColor: theme.accent, width: 16 }]}
          />
        </View>
      </GlassCard>

      {/* BROWSE card */}
      <GlassCard glassStyle="clear" specular style={styles.mimicCard}>
        <Text style={styles.mimicCardLabel}>BROWSE</Text>

        <View style={styles.segmentedWrap}>
          <LiquidGlassSegmentedControl<'pages' | 'surahs' | 'juz'>
            options={[
              { value: 'pages', label: 'Pages' },
              { value: 'surahs', label: 'Surahs' },
              { value: 'juz', label: 'Juz' },
            ]}
            value="pages"
            onChange={() => {}}
          />
        </View>

        <View style={styles.filterRow}>
          <GlassCard style={styles.filterChip}>
            <Ionicons name="filter-outline" size={16} color={theme.textSecondary} />
            <Text style={[styles.filterText, { color: theme.textPrimary }]}>
              All juz
            </Text>
            <Ionicons name="chevron-down" size={16} color={theme.textMuted} />
          </GlassCard>
          <GlassCard style={styles.filterChip}>
            <Ionicons name="pulse-outline" size={16} color={theme.textSecondary} />
            <Text style={[styles.filterText, { color: theme.textPrimary }]}>
              {label}
            </Text>
            <Ionicons name="chevron-down" size={16} color={theme.textMuted} />
          </GlassCard>
        </View>

        <PressableScale onPress={onTapPage} haptic="light" scale={0.99}>
          <View style={styles.browseRow}>
            <View style={[styles.strengthDot, { backgroundColor: color }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.browseRowTitle}>
                Page {pageNumber} · {surahName}
              </Text>
              <Text style={styles.browseRowMeta}>
                Juz 1 · just rated
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
          </View>
        </PressableScale>
      </GlassCard>
    </View>
  );
}

function CtaStep({
  theme,
  styles,
}: {
  theme: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View>
      <View style={styles.iconCircle}>
        <Ionicons name="sparkles" size={32} color={theme.accent} />
      </View>
      <Text style={styles.headline}>Enable Smart Tracking?</Text>
      <Text style={styles.subhead}>
        Turn it on to start rating pages in your real revision sessions and
        unlock the Insights tab. You can switch it off anytime in Settings.
      </Text>
      <View style={styles.bulletList}>
        <View style={styles.bulletRow}>
          <View style={[styles.bulletIcon, { backgroundColor: theme.accent + '20' }]}>
            <Ionicons name="checkmark" size={16} color={theme.accent} />
          </View>
          <Text style={styles.bulletText}>
            Lets you rate pages from the session menu while revising.
          </Text>
        </View>
        <View style={styles.bulletRow}>
          <View style={[styles.bulletIcon, { backgroundColor: theme.accent + '20' }]}>
            <Ionicons name="checkmark" size={16} color={theme.accent} />
          </View>
          <Text style={styles.bulletText}>
            Unlocks the Insights tab with personalized recommendations.
          </Text>
        </View>
      </View>
    </View>
  );
}

// Mock of the real SettingsScreen so the user sees the toggle in context.
// The Smart Tracking row pulses with a soft accent ring so they can spot it
// at a glance — same idea as the glowing Insights tab discovery hook.
function NotNowPointerStep({
  theme,
  styles,
}: {
  theme: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
}) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, {
        duration: 1400,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true,
    );
    return () => cancelAnimation(pulse);
  }, [pulse]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 1], [0.35, 0.9]),
  }));

  return (
    <View>
      <Text style={styles.stepTitle}>No problem</Text>
      <CoachMark
        text="You can flip it on anytime — here's where to find it in Settings."
        theme={theme}
        styles={styles}
      />

      {/* Settings page mimic */}
      <View style={styles.settingsHeader}>
        <Text style={styles.settingsScreenTitle}>Settings</Text>
      </View>

      <Text style={styles.settingsSectionLabel}>REVISION</Text>
      <View style={styles.settingsCard}>
        <GlassCard style={StyleSheet.absoluteFillObject} />
        {/* Smart Tracking — the glowing row */}
        <View style={styles.settingsRowOuter}>
          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFillObject,
              styles.settingsRowGlow,
              { borderColor: theme.accent },
              glowStyle,
            ]}
          />
          <View style={styles.settingsRowInner}>
            <View style={[styles.settingsIcon, { backgroundColor: theme.accent + '20' }]}>
              <Ionicons name="sparkles-outline" size={16} color={theme.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingsLabel}>Smart Tracking</Text>
              <Text style={styles.settingsHelper}>
                Turn on to rate pages and see personalized insights.
              </Text>
            </View>
            <Switch
              value={false}
              onValueChange={() => {}}
              trackColor={{ false: theme.border, true: theme.accent }}
              thumbColor={Platform.OS === 'android' ? theme.bg : undefined}
              disabled
            />
          </View>
        </View>

        <View style={styles.settingsDivider} />

        {/* Pages per day — non-interactive context */}
        <View style={styles.settingsRowInner}>
          <View style={[styles.settingsIcon, { backgroundColor: theme.accent + '20' }]}>
            <Ionicons name="layers-outline" size={16} color={theme.accent} />
          </View>
          <Text style={[styles.settingsLabel, { flex: 1 }]}>Pages per day</Text>
          <Text style={styles.settingsValue}>20 pages</Text>
          <Ionicons
            name="chevron-forward"
            size={18}
            color={theme.textMuted}
            style={{ marginLeft: spacing.xs }}
          />
        </View>

        <View style={styles.settingsDivider} />

        <View style={styles.settingsRowInner}>
          <View style={[styles.settingsIcon, { backgroundColor: theme.accent + '20' }]}>
            <Ionicons name="calendar-outline" size={16} color={theme.accent} />
          </View>
          <Text style={[styles.settingsLabel, { flex: 1 }]}>Active days</Text>
          <Text style={styles.settingsValue}>Every day</Text>
          <Ionicons
            name="chevron-forward"
            size={18}
            color={theme.textMuted}
            style={{ marginLeft: spacing.xs }}
          />
        </View>
      </View>
    </View>
  );
}

function SandboxPagePreviewModal({
  pageNumber,
  onClose,
  theme,
  isDark,
}: {
  pageNumber: number | null;
  onClose: () => void;
  theme: ThemeColors;
  isDark: boolean;
}) {
  const [loading, setLoading] = useState(true);

  if (pageNumber === null) return null;

  const surah = getSurahForPage(pageNumber);
  const imageUrl = getQuranPageImageUrl(pageNumber);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={previewModalStyles.backdrop} onPress={onClose}>
        <Pressable
          style={previewModalStyles.card}
          onPress={() => {}}
        >
          <GlassCard style={StyleSheet.absoluteFillObject} />
          <View
            style={[
              previewModalStyles.headerRow,
              { borderBottomColor: theme.border },
            ]}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={[previewModalStyles.title, { color: theme.textPrimary }]}
              >
                Page {pageNumber}
              </Text>
              <Text
                style={[previewModalStyles.subtitle, { color: theme.textSecondary }]}
              >
                {surah.name} · {surah.nameArabic}
              </Text>
            </View>
            <PressableScale
              onPress={onClose}
              haptic="light"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <GlassCard style={previewModalStyles.closeBtn}>
                <Ionicons name="close" size={20} color={theme.textPrimary} />
              </GlassCard>
            </PressableScale>
          </View>
          <View
            style={[
              previewModalStyles.imageWrap,
              { backgroundColor: isDark ? '#000000' : theme.surface },
            ]}
          >
            {loading && (
              <ActivityIndicator
                size="large"
                color={theme.textMuted}
                style={previewModalStyles.loader}
              />
            )}
            <Image
              source={{ uri: imageUrl }}
              resizeMode="contain"
              style={[
                previewModalStyles.image,
                isDark && { tintColor: '#FFFFFF' },
              ]}
              onLoadStart={() => setLoading(true)}
              onLoad={() => setLoading(false)}
              onError={() => setLoading(false)}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const previewModalStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  card: {
    borderRadius: radius.lg,
    width: '100%',
    maxWidth: 380,
    maxHeight: '80%',
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    ...typography.titleMedium,
    marginBottom: 2,
  },
  subtitle: { ...typography.bodySmall },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageWrap: {
    aspectRatio: 2 / 3,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loader: { position: 'absolute' },
  image: {
    width: '100%',
    height: '100%',
  },
});

// ---------------------------------------------------------------------------
// Sandbox rating sheet — mirrors WeaknessModal visually but never writes.
// ---------------------------------------------------------------------------

function SandboxRatingSheet({
  visible,
  pageNumber,
  surahName,
  currentRating,
  onPick,
  onClose,
  theme,
}: {
  visible: boolean;
  pageNumber: number;
  surahName: string;
  currentRating?: number;
  onPick: (rating: number) => void;
  onClose: () => void;
  theme: ThemeColors;
}) {
  const styles = useMemo(() => makeSheetStyles(theme), [theme]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.sheet}>
          <GlassCard style={StyleSheet.absoluteFillObject} />
          <View style={styles.dragHandle} />
          <Text style={styles.headline}>Rate this page</Text>
          <Text style={styles.subtext}>
            Page {pageNumber} · {surahName}
          </Text>
          <View style={styles.ratingsContainer}>
            {RATINGS.map((r) => {
              const isSelected = currentRating === r.value;
              const color = getStrengthColor(r.value, theme);
              return (
                <PressableScale
                  key={r.value}
                  onPress={() => onPick(r.value)}
                  haptic="selection"
                  scale={0.97}
                  style={[
                    styles.ratingChip,
                    isSelected && {
                      backgroundColor: color + '20',
                      borderColor: color,
                    },
                  ]}
                >
                  {!isSelected && (
                    <GlassCard style={StyleSheet.absoluteFillObject} />
                  )}
                  <Text
                    style={[
                      styles.ratingChipText,
                      { color: isSelected ? color : theme.textPrimary },
                    ]}
                  >
                    {r.label}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    eyebrow: {
      ...typography.label,
      color: theme.accent,
      letterSpacing: 1.2,
    },
    closeButton: {
      width: 40,
      height: 40,
      borderRadius: radius.full,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },
    scroll: { flex: 1 },
    scrollContent: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
    },
    iconCircle: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: theme.accent + '20',
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
      marginBottom: spacing.lg,
    },
    headline: {
      ...typography.displaySmall,
      color: theme.textPrimary,
      textAlign: 'center',
      marginBottom: spacing.sm,
    },
    subhead: {
      ...typography.bodyMedium,
      color: theme.textSecondary,
      textAlign: 'center',
      marginBottom: spacing.xl,
    },
    bulletList: { gap: spacing.md },
    bulletRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
    },
    bulletIcon: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
    },
    bulletText: {
      ...typography.bodyMedium,
      color: theme.textPrimary,
      flex: 1,
      lineHeight: 20,
    },

    stepTitle: {
      ...typography.label,
      color: theme.textMuted,
      letterSpacing: 1,
      marginBottom: spacing.sm,
    },
    coachMark: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      borderRadius: radius.md,
      backgroundColor: theme.accent + '14',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.accent + '40',
      marginBottom: spacing.lg,
    },
    coachDot: {
      width: 8,
      height: 8,
      borderRadius: radius.full,
      marginTop: 7,
    },
    coachText: {
      ...typography.bodySmall,
      color: theme.textPrimary,
      flex: 1,
      lineHeight: 18,
    },

    // Rate step — mirrors the real ActiveRevisionScreen layout so the user
    // sees what their revision session will actually look like.
    rateBody: {
      flex: 1,
    },
    viewerContainer: { flex: 1 },
    // Floating tooltip pointing up at the (⋮) overflow button in the
    // SessionBar. Tip math: SessionBar paddingHorizontal=spacing.sm puts the
    // (⋮) iconBtn's right edge at spacing.sm from the screen edge; its
    // center sits another 16px in (half of iconBtn width). With the wrap
    // anchored at right=spacing.sm and the caret pushed left by 10px from
    // flex-end, the caret tip lands ~28px from the screen edge — same as
    // the (⋮) center.
    rateCoachWrap: {
      position: 'absolute',
      top: 52,
      right: spacing.sm,
      zIndex: 10,
      alignItems: 'flex-end',
    },
    rateCoachCaret: {
      width: 0,
      height: 0,
      borderLeftWidth: 6,
      borderRightWidth: 6,
      borderBottomWidth: 7,
      borderLeftColor: 'transparent',
      borderRightColor: 'transparent',
      borderBottomColor: theme.accent,
      marginRight: 10,
    },
    rateCoachBubble: {
      backgroundColor: theme.accent,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radius.full,
      ...shadows.md,
    },
    rateCoachText: {
      ...typography.bodySmall,
      color: theme.textInverse,
      fontWeight: '700',
    },
    // Bottom-anchored floating tooltip pointing down at the footer button.
    // Position's `bottom` is set inline so the safe-area inset is accounted
    // for without re-computing styles on insets change.
    bottomCoachWrap: {
      position: 'absolute',
      left: 0,
      right: 0,
      alignItems: 'center',
      zIndex: 10,
    },
    bottomCoachBubble: {
      backgroundColor: theme.accent,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radius.full,
      ...shadows.md,
    },
    bottomCoachText: {
      ...typography.bodySmall,
      color: theme.textInverse,
      fontWeight: '700',
    },
    bottomCoachCaret: {
      width: 0,
      height: 0,
      borderLeftWidth: 6,
      borderRightWidth: 6,
      borderTopWidth: 7,
      borderLeftColor: 'transparent',
      borderRightColor: 'transparent',
      borderTopColor: theme.accent,
      marginTop: -1,
    },
    previewBreadcrumb: {
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
    previewFooter: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: spacing.md,
      alignItems: 'center',
    },
    previewPageNum: {
      fontSize: 13,
      fontWeight: '500',
      color: theme.textPrimary,
    },

    // Insights tab mimic — mirrors AlgorithmScreen styles exactly so the
    // sandbox feels like a true preview of what the user will see.
    insightsHeader: { marginBottom: spacing.lg },
    insightsTitle: {
      ...typography.displaySmall,
      color: theme.textPrimary,
      marginBottom: spacing.xs,
    },
    insightsSubtitle: {
      ...typography.bodyMedium,
      color: theme.textSecondary,
    },
    mimicCard: {
      marginBottom: spacing.lg,
      padding: spacing.lg,
      borderRadius: radius.lg,
    },
    mimicCardHeader: {
      paddingHorizontal: spacing.lg,
      marginBottom: spacing.md,
    },
    mimicCardLabel: {
      ...typography.label,
      color: theme.textMuted,
      marginBottom: spacing.xs,
    },
    mimicCardSubtitle: {
      ...typography.bodySmall,
      color: theme.textSecondary,
    },

    // Focus card — same as AlgorithmScreen
    focusInner: {
      borderLeftWidth: 3,
      borderRadius: radius.md,
      padding: spacing.lg,
    },
    focusHeaderRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md,
      marginBottom: spacing.md,
    },
    focusPageLabel: {
      ...typography.bodySmall,
      color: theme.textMuted,
      marginBottom: 2,
    },
    focusSurahName: {
      ...typography.titleMedium,
      color: theme.textPrimary,
      fontWeight: '700',
      marginBottom: 2,
    },
    focusSurahArabic: {
      ...typography.bodyMedium,
      color: theme.textSecondary,
    },
    focusFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    focusReason: {
      ...typography.bodySmall,
      color: theme.textMuted,
      flex: 1,
    },
    openHint: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    openHintText: {
      ...typography.bodySmall,
      fontWeight: '600',
    },
    strengthBadge: {
      width: 28,
      height: 28,
      borderRadius: 14,
      borderWidth: 1.5,
      alignItems: 'center',
      justifyContent: 'center',
    },
    strengthBadgeText: {
      ...typography.bodySmall,
      fontSize: 12,
      fontWeight: '700',
    },
    dotRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 6,
      marginTop: spacing.md,
    },
    dot: {
      height: 6,
      borderRadius: radius.full,
    },

    // Browse card — same as AlgorithmScreen
    segmentedWrap: {
      marginBottom: spacing.md,
    },
    filterRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
      marginBottom: spacing.lg,
    },
    filterChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radius.full,
    },
    filterText: {
      ...typography.bodySmall,
      fontWeight: '600',
    },
    browseRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
    },
    strengthDot: {
      width: 10,
      height: 10,
      borderRadius: radius.full,
    },
    browseRowTitle: {
      ...typography.bodyMedium,
      color: theme.textPrimary,
      fontWeight: '600',
      marginBottom: 2,
    },
    browseRowMeta: {
      ...typography.bodySmall,
      color: theme.textMuted,
      fontSize: 11,
    },

    // Not-now pointer — Settings page mimic
    settingsHeader: {
      marginBottom: spacing.lg,
    },
    settingsScreenTitle: {
      ...typography.displaySmall,
      color: theme.textPrimary,
    },
    settingsSectionLabel: {
      ...typography.label,
      color: theme.textMuted,
      marginBottom: spacing.xs,
      paddingHorizontal: spacing.md,
      letterSpacing: 1,
    },
    settingsCard: {
      borderRadius: radius.md,
      overflow: 'hidden',
    },
    settingsRowOuter: {
      position: 'relative',
    },
    settingsRowGlow: {
      borderRadius: radius.md,
      borderWidth: 2,
      // Soft shadow halo via shadow props; opacity is animated by the parent.
      shadowColor: theme.accent,
      shadowOpacity: 0.6,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 0 },
    },
    settingsRowInner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
    },
    settingsIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    settingsLabel: {
      ...typography.bodyMedium,
      color: theme.textPrimary,
    },
    settingsHelper: {
      ...typography.bodySmall,
      color: theme.textSecondary,
      marginTop: 2,
    },
    settingsValue: {
      ...typography.bodyMedium,
      color: theme.textSecondary,
    },
    settingsDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.border,
      marginLeft: spacing.md + 32 + spacing.sm,
    },

    // Footer
    footer: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      overflow: 'hidden',
    },
    fullButton: { width: '100%' },
    ctaButtons: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    halfButton: { flex: 1 },
  });

const makeSheetStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    sheet: {
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xl,
      overflow: 'hidden',
    },
    dragHandle: {
      width: 40,
      height: 4,
      borderRadius: radius.full,
      backgroundColor: theme.border,
      alignSelf: 'center',
      marginBottom: spacing.md,
    },
    headline: {
      ...typography.titleLarge,
      color: theme.textPrimary,
      textAlign: 'center',
      marginBottom: spacing.xs,
    },
    subtext: {
      ...typography.bodySmall,
      color: theme.textSecondary,
      textAlign: 'center',
      marginBottom: spacing.lg,
    },
    ratingsContainer: {
      gap: spacing.xs,
    },
    ratingChip: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1.5,
      borderColor: 'transparent',
      alignItems: 'center',
      overflow: 'hidden',
    },
    ratingChipText: {
      ...typography.bodyMedium,
      fontWeight: '600',
    },
  });
