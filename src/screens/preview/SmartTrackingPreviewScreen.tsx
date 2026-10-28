import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
import { MushafPager } from '../../components/MushafPager';
import { SessionMenuSheet } from '../../components/revision/SessionMenuSheet';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { getHizbForPage, getSurahForPage, getQuranData } from '../../lib/quranData';
import { RATINGS, getRatingLabel } from '../../lib/ratings';
import { useHaptics } from '../../design/haptics';
import { getReadPalette } from '../../theme/readPalette';
import { layoutV2, typeV2 } from '../../theme/v2';
import { RoundButton } from '../../components/reader/RoundButton';
import { IconButton, Toggle, TopBar } from '../../components/v2/TopBar';
import { PillButton } from '../../components/v2/PillButton';
import { PillTabs } from '../../components/v2/PillTabs';
import { Sheet } from '../../components/v2/Sheet';
import { Tap } from '../../components/v2/Tap';
import {
  Hairline,
  InsightRow,
  PagePreviewSheet,
  SectionHeader,
  StrengthBar,
  strengthTone,
} from '../../components/insights/InsightsV2';

type Step = 'intro' | 'rate' | 'insights' | 'cta' | 'not_now_pointer';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function SmartTrackingPreviewScreen({ visible, onClose }: Props) {
  const { user, pages, saveUser } = useApp();
  const { isDark, palette } = useTheme();
  const haptics = useHaptics();
  const insets = useSafeAreaInsets();
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
      haptics.success();
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

  // The five steps on a flat ground, a top bar with the close button, a flat
  // bar at the foot with the one action. The demo session uses the real
  // session's header and page colours; the Insights step is the real tab's
  // rows.
  const read = getReadPalette(isDark);
  const scrollV2 = (content: React.ReactNode) => (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={{ paddingBottom: layoutV2.rowPad }}
      showsVerticalScrollIndicator={false}
      testID={`preview-step-${step}`}
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
      <View style={[styles.container, { paddingTop: insets.top, backgroundColor: palette.bg }]} testID="smart-preview">
        <TopBar
          title="Smart Tracking"
          right={
            step !== 'not_now_pointer' ? (
              <IconButton icon="close" label="Close preview" onPress={handleClose} testID="preview-close" />
            ) : undefined
          }
          separator
        />

        {step === 'intro' && scrollV2(<IntroStepV2 />)}

        {step === 'rate' && (
          <View style={[styles.rateBody, { backgroundColor: read.pageBg }]} testID="preview-step-rate">
            <View style={v2.sessionHeader}>
              <View style={v2.sessionTitle}>
                <Text style={[typeV2.name, { color: read.textPrimary }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                  {`Revising Juz ${demoJuz} `}
                  <Text style={{ color: read.textSecondary, fontWeight: '400' }}>{`· ${demoMarked ? 1 : 0}/1`}</Text>
                </Text>
                <Text style={[typeV2.meta, { color: read.textSecondary }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                  {`Page ${demoPage.pageNumber} · Juz ${demoJuz} · Hizb ${demoHizb}`}
                </Text>
              </View>
              <RoundButton
                icon={demoMarked ? 'checkmark' : 'checkmark-outline'}
                label={demoMarked ? 'Unmark current page' : 'Mark current page as revised'}
                onPress={() => {
                  haptics.selection();
                  setDemoMarked((v) => !v);
                }}
                palette={read}
                active={demoMarked}
              />
              <RoundButton icon="ellipsis-horizontal" label="Session menu" onPress={() => setMenuOpen(true)} palette={read} />
            </View>
            <Text
              style={[typeV2.meta, v2.hint, { color: read.textSecondary }]}
              maxFontSizeMultiplier={1.3}
              testID="preview-rate-hint"
            >
              {demoRating === null
                ? 'Tap ⋯, then Rate page strength'
                : `Rated ${getRatingLabel(demoRating).toLowerCase()}.`}
            </Text>
            <View style={styles.viewerContainer}>
              <MushafPager pages={[demoPage.pageNumber]} initialPage={demoPage.pageNumber} />
            </View>
          </View>
        )}

        {step === 'insights' &&
          demoRating !== null &&
          scrollV2(
            <InsightsTabMimicV2
              pageNumber={demoPage.pageNumber}
              surahName={demoSurah.name}
              juz={demoJuz}
              rating={demoRating}
              onTapPage={() => setPreviewPageNumber(demoPage.pageNumber)}
            />,
          )}

        {step === 'cta' && scrollV2(<CtaStepV2 />)}

        {step === 'not_now_pointer' && scrollV2(<NotNowPointerStepV2 />)}

        <View
          style={[
            v2.footer,
            { borderTopColor: palette.separator, paddingBottom: Math.max(insets.bottom, layoutV2.gutter) },
          ]}
        >
          {step === 'intro' && <PillButton size="lg" title="Show me" onPress={() => setStep('rate')} testID="preview-show-me" />}
          {step === 'rate' && (
            <PillButton
              size="lg"
              title={demoRating === null ? 'Rate the page to continue' : 'Continue'}
              onPress={() => setStep('insights')}
              disabled={demoRating === null}
              testID="preview-continue"
            />
          )}
          {step === 'insights' && <PillButton size="lg" title="Next" onPress={() => setStep('cta')} testID="preview-next" />}
          {step === 'cta' && (
            <View style={v2.ctaButtons}>
              <PillButton size="lg" title="Enable" onPress={handleEnable} busy={saving} testID="preview-enable" />
              <PillButton
                size="lg"
                variant="outline"
                title="Not now"
                onPress={handleNotNow}
                disabled={saving}
                testID="preview-not-now"
              />
            </View>
          )}
          {step === 'not_now_pointer' && (
            <PillButton size="lg" title="Got it" onPress={handleGotIt} testID="preview-got-it" />
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

        <SandboxRatingSheetV2
          visible={ratingSheetOpen}
          pageNumber={demoPage.pageNumber}
          surahName={demoSurah.name}
          currentRating={demoRating ?? undefined}
          onPick={(r) => {
            haptics.selection();
            setDemoRating(r);
            setRatingSheetOpen(false);
          }}
          onClose={() => setRatingSheetOpen(false)}
        />

        <PagePreviewSheet pageNumber={previewPageNumber} onClose={() => setPreviewPageNumber(null)} />
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

/** A step's large title and the line under it. */
function StepTitleV2({ title, body }: { title: string; body?: string }) {
  const { palette } = useTheme();
  return (
    <View style={v2.titleBlock}>
      <Text style={[typeV2.largeTitle, { color: palette.text }]} accessibilityRole="header" maxFontSizeMultiplier={1.4}>
        {title}
      </Text>
      {body ? <Text style={[typeV2.body, { color: palette.secondary }]}>{body}</Text> : null}
    </View>
  );
}

/** A point in a list: a 24pt outline icon and a line of text, as Settings' rows. */
function PointV2({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  const { palette } = useTheme();
  return (
    <View style={v2.point}>
      <Ionicons name={icon} size={24} color={palette.text} />
      <Text style={[typeV2.body, v2.flex, { color: palette.text }]}>{text}</Text>
    </View>
  );
}

function IntroStepV2() {
  return (
    <View>
      <StepTitleV2
        title="Meet Smart Tracking"
        body="An optional layer that learns your weak spots and shows what to focus on next."
      />
      <Hairline />
      <View style={v2.points}>
        <PointV2 icon="pulse-outline" text="Rate a page after revising it, so the app learns where you're shaky." />
        <PointV2 icon="analytics-outline" text="See the pages that need your attention most." />
        <PointV2 icon="filter-outline" text="Filter by strength to find weak spots across your memorization." />
      </View>
    </View>
  );
}

// The real Insights tab's rows (components/insights), with the rated page.
function InsightsTabMimicV2({
  pageNumber,
  surahName,
  juz,
  rating,
  onTapPage,
}: {
  pageNumber: number;
  surahName: string;
  juz: number;
  rating: number;
  onTapPage: () => void;
}) {
  const { palette } = useTheme();
  const label = getRatingLabel(rating);
  const reason = rating <= 2 ? `You marked this as ${label.toLowerCase()}` : 'Recently rated, keep it fresh';
  return (
    <View>
      <StepTitleV2 title="Insights" body="This is your Insights tab: where you stand and what to focus on. Tap a page to open it." />
      <Hairline />
      <SectionHeader title="Strength" detail="1 revised page" />
      <StrengthBar ratings={[rating]} />
      <Hairline />
      <SectionHeader title="Focus" detail="Revise these first: the weakest and most overdue" />
      <InsightRow
        number={pageNumber}
        name={`Page ${pageNumber} · ${surahName}`}
        rating={rating}
        text={`${label} · ${reason}`}
        onPress={onTapPage}
        separator={false}
        testID="mimic-focus"
      />
      <Hairline />
      <SectionHeader title="Browse" detail="Weakest first" />
      <View style={v2.controls}>
        <PillTabs<'pages' | 'surahs' | 'juz'>
          options={[
            { value: 'pages', label: 'Pages' },
            { value: 'surahs', label: 'Surahs' },
            { value: 'juz', label: 'Juz' },
          ]}
          value="pages"
          onChange={() => undefined}
        />
        <View style={v2.filters}>
          <PillButton title="All juz" icon="filter-outline" size="sm" variant="outline" onPress={() => undefined} />
          <PillButton title={label} icon="pulse-outline" size="sm" onPress={() => undefined} />
        </View>
      </View>
      <View style={{ height: layoutV2.hairline, backgroundColor: palette.separator }} />
      <InsightRow
        number={pageNumber}
        name={`Page ${pageNumber} · ${surahName}`}
        rating={rating}
        text={`${label} · Juz ${juz} · just rated`}
        onPress={onTapPage}
        testID="mimic-browse"
      />
    </View>
  );
}

function CtaStepV2() {
  return (
    <View>
      <StepTitleV2
        title="Enable Smart Tracking?"
        body="Turn it on to rate pages in your revision sessions and see the Insights tab. You can turn it off in Settings any time."
      />
      <Hairline />
      <View style={v2.points}>
        <PointV2 icon="checkmark-circle-outline" text="Rate pages from the session menu while revising." />
        <PointV2 icon="checkmark-circle-outline" text="The Insights tab shows what to focus on." />
      </View>
    </View>
  );
}

// Settings' Revision section, the Smart Tracking row lit up so it's easy to
// find again.
function NotNowPointerStepV2() {
  const { palette } = useTheme();
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.ease) }), -1, true);
    return () => cancelAnimation(pulse);
  }, [pulse]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 1], [0.4, 1]),
  }));

  return (
    <View>
      <StepTitleV2 title="No problem" body="Turn it on any time: Settings, under Revision." />
      <Hairline />
      <SectionHeader title="Revision" />
      <View style={v2.settingsRow} testID="mimic-settings-row">
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFillObject, { backgroundColor: palette.accentSubtle }, glowStyle]}
        />
        <View style={v2.settingsRowHead}>
          <Ionicons name="analytics-outline" size={24} color={palette.text} />
          <Text style={[typeV2.body, v2.flex, { color: palette.text }]}>Smart Tracking</Text>
          <Toggle value={false} onValueChange={() => undefined} disabled accessibilityLabel="Smart Tracking" />
        </View>
        <Text style={[typeV2.meta, v2.settingsHelp, { color: palette.secondary }]}>
          Turn on to rate pages from the session menu and see personalized insights.
        </Text>
      </View>
      <Hairline />
    </View>
  );
}

// Mirrors the rating sheet (WeaknessModal) but never writes; a pick closes it.
function SandboxRatingSheetV2({
  visible,
  pageNumber,
  surahName,
  currentRating,
  onPick,
  onClose,
}: {
  visible: boolean;
  pageNumber: number;
  surahName: string;
  currentRating?: number;
  onPick: (rating: number) => void;
  onClose: () => void;
}) {
  const { palette } = useTheme();
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Rate this page"
      message={`Page ${pageNumber} · ${surahName}`}
      left={{ label: 'Cancel', onPress: onClose }}
      scroll
      testID="sandbox-rating-sheet"
    >
      {RATINGS.map((r) => {
        const selected = currentRating === r.value;
        return (
          <Tap
            key={r.value}
            onPress={() => onPick(r.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={r.label}
            style={v2.ratingRow}
            testID={`sandbox-rating-${r.value}`}
          >
            <View style={[v2.dot, { backgroundColor: strengthTone(r.value, palette) }]} />
            <Text style={[typeV2.menu, v2.flex, { color: palette.text }, selected && v2.strong]}>{r.label}</Text>
            {selected ? <Ionicons name="checkmark" size={20} color={palette.text} /> : null}
          </Tap>
        );
      })}
    </Sheet>
  );
}

const v2 = StyleSheet.create({
  flex: { flex: 1 },
  strong: { fontWeight: '600' },
  titleBlock: { paddingHorizontal: layoutV2.gutter, paddingTop: 16, paddingBottom: layoutV2.rowPad, gap: 6 },
  points: { paddingHorizontal: layoutV2.gutter, paddingVertical: 8 },
  point: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 52, paddingVertical: 10 },
  sessionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: layoutV2.gutter,
    paddingRight: layoutV2.gutter - 6,
    paddingVertical: 8,
  },
  sessionTitle: { flex: 1, minWidth: 0 },
  hint: { paddingHorizontal: layoutV2.gutter, paddingBottom: 8 },
  controls: { paddingHorizontal: layoutV2.gutter, paddingTop: 8, paddingBottom: 12, gap: 10 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  settingsRow: { paddingHorizontal: layoutV2.gutter, paddingVertical: 12, overflow: 'hidden' },
  settingsRowHead: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 32 },
  settingsHelp: { marginLeft: 40, marginTop: 4 },
  footer: {
    paddingHorizontal: layoutV2.gutter,
    paddingTop: 12,
    borderTopWidth: layoutV2.hairline,
  },
  ctaButtons: { gap: 10 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 52, paddingHorizontal: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
});

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  scroll: { flex: 1 },
  rateBody: {
    flex: 1,
  },
  viewerContainer: { flex: 1 },
});
