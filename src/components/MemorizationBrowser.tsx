import React, { useCallback, useMemo, useState } from 'react';
import {
  LayoutAnimation,
  Platform,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { GlassCard } from './GlassCard';
import { PressableScale } from './PressableScale';
import { SegmentedToggle } from './SegmentedToggle';
import { useTheme } from '../context/ThemeContext';
import { useDesign } from '../design/DesignContext';
import { useHaptics } from '../design/haptics';
import { ProgressBar } from './ProgressBar';
import { Mark } from './v2/Mark';
import { PillTabs } from './v2/PillTabs';
import { Tap } from './v2/Tap';
import { IconButton } from './v2/TopBar';
import { arabicV2, layoutV2, markV2, radiusV2, typeV2 } from '../theme/v2';
import { ThemeColors } from '../theme/colors';
import { typography, fonts } from '../theme/typography';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import {
  getAllHizbs,
  getAllSurahs,
  getJuzRange,
  getJuzStartingSurah,
  getHizbStartingSurah,
  getPagesForHizb,
  getPagesForJuz,
  getPagesForSurah,
  getSurahsForPage,
  getSurahsInHizb,
  getSurahsInJuz,
  HizbInfo,
} from '../lib/quranData';
import { UserPage } from '../types';
import { PageStatus } from '../lib/memorizationChanges';

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export type BrowserMode = 'chapter' | 'juz' | 'hizb';

interface MemorizationBrowserProps {
  pages: UserPage[];
  pendingChanges: Map<number, PageStatus>;
  onChange: (next: Map<number, PageStatus>) => void;
  baseMemorizedSurahs?: number[];
  pendingSurahChanges?: Map<number, PageStatus>;
  onSurahChange?: (next: Map<number, PageStatus>) => void;
  /** Initial mode when first mounted. Persists per session via internal state. */
  initialMode?: BrowserMode;
  /** Initial mark-mode state (uncontrolled). Ignored if `markMode` is provided. */
  initialMarkMode?: boolean;
  /** Controlled mark mode. If provided, parent owns the state. */
  markMode?: boolean;
  /** Fires whenever mark mode toggles (controlled or uncontrolled). */
  onMarkModeChange?: (next: boolean) => void;
  /** Hide the internal pencil/check button. Useful when the parent screen
   *  hosts its own mark-mode toggle in a header. */
  hideMarkToggle?: boolean;
}

const CHECKBOX_COL_WIDTH = 36;

export function MemorizationBrowser({
  pages,
  pendingChanges,
  onChange,
  baseMemorizedSurahs = [],
  pendingSurahChanges,
  onSurahChange,
  initialMode = 'chapter',
  initialMarkMode = false,
  markMode: controlledMarkMode,
  onMarkModeChange,
  hideMarkToggle = false,
}: MemorizationBrowserProps) {
  const { theme, isDark } = useTheme();
  const { isNew } = useDesign();
  const styles = useMemo(() => makeStyles(theme, isDark), [theme, isDark]);

  const [mode, setMode] = useState<BrowserMode>(initialMode);
  const [internalMarkMode, setInternalMarkMode] = useState(initialMarkMode);
  const markMode = controlledMarkMode ?? internalMarkMode;
  const setMarkMode = useCallback(
    (next: boolean) => {
      if (controlledMarkMode === undefined) setInternalMarkMode(next);
      onMarkModeChange?.(next);
    },
    [controlledMarkMode, onMarkModeChange],
  );
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [expandedChildKey, setExpandedChildKey] = useState<string | null>(null);

  const surahTrackingEnabled = !!pendingSurahChanges && !!onSurahChange;

  const baseSurahSet = useMemo(
    () => new Set(baseMemorizedSurahs),
    [baseMemorizedSurahs],
  );

  const effectiveSurahSet = useMemo(() => {
    if (!surahTrackingEnabled) return new Set<number>();
    const next = new Set(baseSurahSet);
    pendingSurahChanges!.forEach((status, num) => {
      if (status === 'memorized') next.add(num);
      else next.delete(num);
    });
    return next;
  }, [surahTrackingEnabled, baseSurahSet, pendingSurahChanges]);

  const baseStatusByPage = useMemo(() => {
    const map = new Map<number, PageStatus>();
    for (const p of pages) {
      map.set(p.pageNumber, p.status === 'memorized' ? 'memorized' : 'not_memorized');
    }
    return map;
  }, [pages]);

  const getStatus = useCallback(
    (pageNumber: number): PageStatus => {
      const override = pendingChanges.get(pageNumber);
      if (override !== undefined) return override;
      return baseStatusByPage.get(pageNumber) ?? 'not_memorized';
    },
    [baseStatusByPage, pendingChanges],
  );

  const applyBulk = useCallback(
    (pageNumbers: number[], target: PageStatus) => {
      const next = new Map(pendingChanges);
      for (const pn of pageNumbers) {
        const original = baseStatusByPage.get(pn) ?? 'not_memorized';
        if (original === target) next.delete(pn);
        else next.set(pn, target);
      }
      onChange(next);
    },
    [pendingChanges, baseStatusByPage, onChange],
  );

  const countMemorized = useCallback(
    (pageNumbers: number[]) => {
      let n = 0;
      for (const pn of pageNumbers) if (getStatus(pn) === 'memorized') n++;
      return n;
    },
    [getStatus],
  );

  const setSurahPending = useCallback(
    (surahNumber: number, target: PageStatus) => {
      if (!surahTrackingEnabled) return;
      const next = new Map(pendingSurahChanges!);
      const baseTarget: PageStatus = baseSurahSet.has(surahNumber)
        ? 'memorized'
        : 'not_memorized';
      if (baseTarget === target) next.delete(surahNumber);
      else next.set(surahNumber, target);
      onSurahChange!(next);
    },
    [surahTrackingEnabled, pendingSurahChanges, baseSurahSet, onSurahChange],
  );

  // Tarteel-style cascading toggle for a surah. Updates surah-level intent
  // plus the page-level state, with shared-page protection.
  const toggleSurah = useCallback(
    (surahNumber: number, surahPages: number[]) => {
      const allMemorized =
        countMemorized(surahPages) === surahPages.length;
      const target: PageStatus = allMemorized ? 'not_memorized' : 'memorized';

      if (surahTrackingEnabled) setSurahPending(surahNumber, target);

      if (target === 'memorized') {
        applyBulk(surahPages, 'memorized');
        return;
      }

      if (!surahTrackingEnabled) {
        applyBulk(surahPages, 'not_memorized');
        return;
      }

      const futureSet = new Set(effectiveSurahSet);
      futureSet.delete(surahNumber);
      const pagesToClear = surahPages.filter((pn) => {
        const surahsOnPage = getSurahsForPage(pn);
        return !surahsOnPage.some((s) => futureSet.has(s.number));
      });
      if (pagesToClear.length > 0) applyBulk(pagesToClear, 'not_memorized');
    },
    [
      countMemorized,
      surahTrackingEnabled,
      setSurahPending,
      effectiveSurahSet,
      applyBulk,
    ],
  );

  const togglePage = useCallback(
    (pageNumber: number) => {
      applyBulk(
        [pageNumber],
        getStatus(pageNumber) === 'memorized' ? 'not_memorized' : 'memorized',
      );
    },
    [applyBulk, getStatus],
  );

  const toggleScope = useCallback(
    (pageNumbers: number[]) => {
      const target: PageStatus =
        countMemorized(pageNumbers) === pageNumbers.length
          ? 'not_memorized'
          : 'memorized';
      applyBulk(pageNumbers, target);
    },
    [countMemorized, applyBulk],
  );

  const expand = useCallback((key: string | null) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedKey((curr) => (curr === key ? null : key));
    setExpandedChildKey(null);
  }, []);

  const expandChild = useCallback((key: string | null) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedChildKey((curr) => (curr === key ? null : key));
  }, []);

  const changeMode = (v: BrowserMode) => {
    setMode(v);
    setExpandedKey(null);
    setExpandedChildKey(null);
  };

  return (
    <View>
      {isNew ? (
        // The new design: pills for the three lenses, then flat rows.
        <ControlsV2
          mode={mode}
          onMode={changeMode}
          markMode={markMode}
          onMarkMode={hideMarkToggle ? undefined : () => setMarkMode(!markMode)}
        />
      ) : (
      /* Mode toggle + mark-mode toggle row */
      <View style={styles.controlRow}>
        <View style={styles.toggleWrap}>
          <SegmentedToggle
            options={[
              { value: 'chapter', label: 'Chapter', count: 114 },
              { value: 'juz', label: 'Juz', count: 30 },
              { value: 'hizb', label: 'Hizb', count: 60 },
            ]}
            value={mode}
            onChange={(v) => {
              setMode(v as BrowserMode);
              setExpandedKey(null);
              setExpandedChildKey(null);
            }}
          />
        </View>
        {!hideMarkToggle && (
          <PressableScale
            onPress={() => setMarkMode(!markMode)}
            haptic="medium"
            scale={0.92}
            style={[
              styles.markToggle,
              markMode && { backgroundColor: theme.accent },
            ]}
            accessibilityLabel={
              markMode ? 'Exit mark mode' : 'Enter mark mode to update memorized pages'
            }
          >
            <Ionicons
              name={markMode ? 'checkmark' : 'pencil-outline'}
              size={18}
              color={markMode ? theme.textInverse : theme.textPrimary}
            />
          </PressableScale>
        )}
      </View>
      )}

      {/* List body */}
      {mode === 'chapter' && (
        <ChapterList
          styles={styles}
          theme={theme}
          markMode={markMode}
          expandedKey={expandedKey}
          onExpand={expand}
          countMemorized={countMemorized}
          togglePage={togglePage}
          toggleSurah={toggleSurah}
          getStatus={getStatus}
        />
      )}
      {mode === 'juz' && (
        <JuzList
          styles={styles}
          theme={theme}
          markMode={markMode}
          expandedKey={expandedKey}
          expandedChildKey={expandedChildKey}
          onExpand={expand}
          onExpandChild={expandChild}
          countMemorized={countMemorized}
          togglePage={togglePage}
          toggleSurah={toggleSurah}
          toggleScope={toggleScope}
          getStatus={getStatus}
        />
      )}
      {mode === 'hizb' && (
        <HizbList
          styles={styles}
          theme={theme}
          markMode={markMode}
          expandedKey={expandedKey}
          expandedChildKey={expandedChildKey}
          onExpand={expand}
          onExpandChild={expandChild}
          countMemorized={countMemorized}
          togglePage={togglePage}
          toggleSurah={toggleSurah}
          toggleScope={toggleScope}
          getStatus={getStatus}
        />
      )}
    </View>
  );
}

// ===== Row helpers =====

type Styles = ReturnType<typeof makeStyles>;

interface CheckboxColumnProps {
  visible: boolean;
  state: 'empty' | 'partial' | 'full';
  onPress?: () => void;
  theme: ThemeColors;
  styles: Styles;
}

function CheckboxColumn({ visible, state, onPress, theme, styles }: CheckboxColumnProps) {
  const offset = useSharedValue(visible ? 0 : -CHECKBOX_COL_WIDTH);
  const opacity = useSharedValue(visible ? 1 : 0);
  React.useEffect(() => {
    offset.value = withTiming(visible ? 0 : -CHECKBOX_COL_WIDTH, { duration: 220 });
    opacity.value = withTiming(visible ? 1 : 0, { duration: 180 });
  }, [visible, offset, opacity]);

  const animStyle = useAnimatedStyle(() => ({
    width: visible ? CHECKBOX_COL_WIDTH : 0,
    transform: [{ translateX: offset.value }],
    opacity: opacity.value,
  }));

  if (!visible) return null;

  const filled = state === 'full';
  const partial = state === 'partial';

  return (
    <Animated.View style={[styles.checkboxCol, animStyle]}>
      <PressableScale
        onPress={onPress}
        haptic="selection"
        scale={0.9}
        hitSlop={6}
        disabled={!onPress}
        style={[
          styles.checkbox,
          filled && {
            backgroundColor: theme.accent,
            borderColor: theme.accent,
          },
          partial && {
            backgroundColor: theme.accentSoft,
            borderColor: theme.accent,
          },
        ]}
      >
        {filled && (
          <Ionicons name="checkmark" size={14} color={theme.textInverse} />
        )}
        {partial && <Ionicons name="remove" size={14} color={theme.accent} />}
      </PressableScale>
    </Animated.View>
  );
}

interface BaseRowProps {
  number: number;
  englishTitle: string;
  englishSub?: string;
  englishSubAlt?: string;
  arabic: string;
  expanded: boolean;
  markMode: boolean;
  checkState: 'empty' | 'partial' | 'full';
  progress?: number; // 0..1
  onPress: () => void;
  onCheckPress?: () => void;
  theme: ThemeColors;
  styles: Styles;
  /** A surah inside a juz or hizb (new design: indented, a smaller mark). */
  nested?: boolean;
  testID?: string;
}

function BaseRow(props: BaseRowProps) {
  const { isNew } = useDesign();
  return isNew ? <BaseRowV2 {...props} /> : <ClassicBaseRow {...props} />;
}

function ClassicBaseRow({
  number,
  englishTitle,
  englishSub,
  englishSubAlt,
  arabic,
  expanded,
  markMode,
  checkState,
  progress,
  onPress,
  onCheckPress,
  theme,
  styles,
}: BaseRowProps) {
  return (
    <View style={styles.rowWrap}>
      <PressableScale onPress={onPress} haptic="light" scale={0.99}>
        <View style={styles.row}>
          <CheckboxColumn
            visible={markMode}
            state={checkState}
            onPress={onCheckPress}
            theme={theme}
            styles={styles}
          />
          <Text style={styles.rowNumber}>{number}</Text>
          <View style={styles.rowMain}>
            <Text style={styles.rowTitle}>{englishTitle}</Text>
            {englishSub ? (
              <Text style={styles.rowSub}>{englishSub}</Text>
            ) : null}
            {englishSubAlt ? (
              <Text style={styles.rowSubAlt}>{englishSubAlt}</Text>
            ) : null}
          </View>
          <Text style={styles.rowArabic}>{arabic}</Text>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={theme.textMuted}
            style={{ marginLeft: spacing.xs }}
          />
        </View>
        {typeof progress === 'number' && progress > 0 && (
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${Math.min(100, progress * 100)}%`,
                  backgroundColor: theme.accent,
                },
              ]}
            />
          </View>
        )}
      </PressableScale>
    </View>
  );
}

// ===== Chapter mode =====

function ChapterList({
  styles,
  theme,
  markMode,
  expandedKey,
  onExpand,
  countMemorized,
  togglePage,
  toggleSurah,
  getStatus,
}: {
  styles: Styles;
  theme: ThemeColors;
  markMode: boolean;
  expandedKey: string | null;
  onExpand: (key: string | null) => void;
  countMemorized: (pages: number[]) => number;
  togglePage: (page: number) => void;
  toggleSurah: (surah: number, pages: number[]) => void;
  getStatus: (page: number) => PageStatus;
}) {
  const all = getAllSurahs();
  return (
    <ListGroup styles={styles}>
      {all.map((s) => {
        const surahPages = getPagesForSurah(s.number);
        const memorized = countMemorized(surahPages);
        const isExpanded = expandedKey === `surah-${s.number}`;
        const state: 'empty' | 'partial' | 'full' =
          memorized === 0
            ? 'empty'
            : memorized === surahPages.length
              ? 'full'
              : 'partial';
        const progress = surahPages.length > 0 ? memorized / surahPages.length : 0;
        return (
          <View key={`c-${s.number}`}>
            <BaseRow
              number={s.number}
              englishTitle={s.name}
              englishSub={`${surahPages.length} page${surahPages.length === 1 ? '' : 's'}`}
              arabic={s.nameArabic}
              expanded={isExpanded}
              markMode={markMode}
              checkState={state}
              progress={progress}
              onPress={() => onExpand(`surah-${s.number}`)}
              onCheckPress={() => toggleSurah(s.number, surahPages)}
              theme={theme}
              styles={styles}
              testID={`surah-${s.number}`}
            />
            {isExpanded && (
              <PageGrid
                pages={surahPages}
                getStatus={getStatus}
                markMode={markMode}
                togglePage={togglePage}
                theme={theme}
                styles={styles}
              />
            )}
          </View>
        );
      })}
    </ListGroup>
  );
}

// ===== Juz mode =====

function JuzList({
  styles,
  theme,
  markMode,
  expandedKey,
  expandedChildKey,
  onExpand,
  onExpandChild,
  countMemorized,
  togglePage,
  toggleSurah,
  toggleScope,
  getStatus,
}: {
  styles: Styles;
  theme: ThemeColors;
  markMode: boolean;
  expandedKey: string | null;
  expandedChildKey: string | null;
  onExpand: (key: string | null) => void;
  onExpandChild: (key: string | null) => void;
  countMemorized: (pages: number[]) => number;
  togglePage: (page: number) => void;
  toggleSurah: (surah: number, pages: number[]) => void;
  toggleScope: (pages: number[]) => void;
  getStatus: (page: number) => PageStatus;
}) {
  const juzes = Array.from({ length: 30 }, (_, i) => i + 1);
  return (
    <ListGroup styles={styles}>
      {juzes.map((juzNumber) => {
        const range = getJuzRange(juzNumber);
        const juzPages = getPagesForJuz(juzNumber);
        const startingSurah = getJuzStartingSurah(juzNumber);
        const memorized = countMemorized(juzPages);
        const isExpanded = expandedKey === `juz-${juzNumber}`;
        const state: 'empty' | 'partial' | 'full' =
          memorized === 0
            ? 'empty'
            : memorized === juzPages.length
              ? 'full'
              : 'partial';
        const progress = juzPages.length > 0 ? memorized / juzPages.length : 0;
        return (
          <View key={`j-${juzNumber}`}>
            <BaseRow
              number={juzNumber}
              englishTitle={`Juz ${juzNumber}`}
              englishSub={
                startingSurah ? `starts with ${startingSurah.name}` : undefined
              }
              englishSubAlt={`Pages ${range.start}–${range.end}`}
              arabic={startingSurah?.nameArabic ?? ''}
              expanded={isExpanded}
              markMode={markMode}
              checkState={state}
              progress={progress}
              onPress={() => onExpand(`juz-${juzNumber}`)}
              onCheckPress={() => toggleScope(juzPages)}
              theme={theme}
              styles={styles}
              testID={`juz-${juzNumber}`}
            />
            {isExpanded && (
              <ChildGroup styles={styles}>
                {getSurahsInJuz(juzNumber).map((s) => {
                  const sMemorized = countMemorized(s.pagesInJuz);
                  const sExpanded =
                    expandedChildKey === `juz-${juzNumber}-surah-${s.number}`;
                  const sState: 'empty' | 'partial' | 'full' =
                    sMemorized === 0
                      ? 'empty'
                      : sMemorized === s.pagesInJuz.length
                        ? 'full'
                        : 'partial';
                  return (
                    <View key={`js-${juzNumber}-${s.number}`}>
                      <BaseRow
                        number={s.number}
                        englishTitle={s.name}
                        englishSub={`${s.pagesInJuz.length} page${s.pagesInJuz.length === 1 ? '' : 's'} in juz`}
                        arabic={s.nameArabic}
                        expanded={sExpanded}
                        markMode={markMode}
                        checkState={sState}
                        onPress={() =>
                          onExpandChild(`juz-${juzNumber}-surah-${s.number}`)
                        }
                        onCheckPress={() => toggleSurah(s.number, s.pagesInJuz)}
                        theme={theme}
                        styles={styles}
                        nested
                        testID={`juz-${juzNumber}-surah-${s.number}`}
                      />
                      {sExpanded && (
                        <PageGrid
                          pages={s.pagesInJuz}
                          getStatus={getStatus}
                          markMode={markMode}
                          togglePage={togglePage}
                          theme={theme}
                          styles={styles}
                          nested
                        />
                      )}
                    </View>
                  );
                })}
              </ChildGroup>
            )}
          </View>
        );
      })}
    </ListGroup>
  );
}

// ===== Hizb mode =====

function HizbList({
  styles,
  theme,
  markMode,
  expandedKey,
  expandedChildKey,
  onExpand,
  onExpandChild,
  countMemorized,
  togglePage,
  toggleSurah,
  toggleScope,
  getStatus,
}: {
  styles: Styles;
  theme: ThemeColors;
  markMode: boolean;
  expandedKey: string | null;
  expandedChildKey: string | null;
  onExpand: (key: string | null) => void;
  onExpandChild: (key: string | null) => void;
  countMemorized: (pages: number[]) => number;
  togglePage: (page: number) => void;
  toggleSurah: (surah: number, pages: number[]) => void;
  toggleScope: (pages: number[]) => void;
  getStatus: (page: number) => PageStatus;
}) {
  const hizbs: HizbInfo[] = getAllHizbs();
  return (
    <ListGroup styles={styles}>
      {hizbs.map((h) => (
        <HizbRow
          key={`h-${h.number}`}
          hizb={h}
          markMode={markMode}
          expanded={expandedKey === `hizb-${h.number}`}
          expandedChildKey={expandedChildKey}
          onExpand={onExpand}
          onExpandChild={onExpandChild}
          countMemorized={countMemorized}
          togglePage={togglePage}
          toggleSurah={toggleSurah}
          toggleScope={toggleScope}
          getStatus={getStatus}
          theme={theme}
          styles={styles}
        />
      ))}
    </ListGroup>
  );
}

function HizbRow({
  hizb,
  markMode,
  expanded,
  expandedChildKey,
  onExpand,
  onExpandChild,
  countMemorized,
  togglePage,
  toggleSurah,
  toggleScope,
  getStatus,
  theme,
  styles,
}: {
  hizb: HizbInfo;
  markMode: boolean;
  expanded: boolean;
  expandedChildKey: string | null;
  onExpand: (key: string | null) => void;
  onExpandChild: (key: string | null) => void;
  countMemorized: (pages: number[]) => number;
  togglePage: (page: number) => void;
  toggleSurah: (surah: number, pages: number[]) => void;
  toggleScope: (pages: number[]) => void;
  getStatus: (page: number) => PageStatus;
  theme: ThemeColors;
  styles: Styles;
}) {
  const hizbPages = useMemo(() => getPagesForHizb(hizb.number), [hizb.number]);
  const startingSurah = useMemo(
    () => getHizbStartingSurah(hizb.number),
    [hizb.number],
  );
  const surahsInside = useMemo(
    () => getSurahsInHizb(hizb.number),
    [hizb.number],
  );

  const memorized = countMemorized(hizbPages);
  const state: 'empty' | 'partial' | 'full' =
    memorized === 0
      ? 'empty'
      : memorized === hizbPages.length
        ? 'full'
        : 'partial';
  const progress = hizbPages.length > 0 ? memorized / hizbPages.length : 0;

  return (
    <View>
      <BaseRow
        number={hizb.number}
        englishTitle={`Hizb ${hizb.number}`}
        englishSub={
          startingSurah ? `starts with ${startingSurah.name}` : undefined
        }
        englishSubAlt={`Juz ${hizb.juzNumber} · Pages ${hizb.startPage}–${hizb.endPage}`}
        arabic={startingSurah?.nameArabic ?? ''}
        expanded={expanded}
        markMode={markMode}
        checkState={state}
        progress={progress}
        onPress={() => onExpand(`hizb-${hizb.number}`)}
        onCheckPress={() => toggleScope(hizbPages)}
        theme={theme}
        styles={styles}
        testID={`hizb-${hizb.number}`}
      />
      {expanded && (
        <ChildGroup styles={styles}>
          {surahsInside.map((s) => {
            const sMemorized = countMemorized(s.pagesInHizb);
            const sExpanded =
              expandedChildKey === `hizb-${hizb.number}-surah-${s.number}`;
            const sState: 'empty' | 'partial' | 'full' =
              sMemorized === 0
                ? 'empty'
                : sMemorized === s.pagesInHizb.length
                  ? 'full'
                  : 'partial';
            return (
              <View key={`hs-${hizb.number}-${s.number}`}>
                <BaseRow
                  number={s.number}
                  englishTitle={s.name}
                  englishSub={`${s.pagesInHizb.length} page${s.pagesInHizb.length === 1 ? '' : 's'} in hizb`}
                  arabic={s.nameArabic}
                  expanded={sExpanded}
                  markMode={markMode}
                  checkState={sState}
                  onPress={() =>
                    onExpandChild(`hizb-${hizb.number}-surah-${s.number}`)
                  }
                  onCheckPress={() => toggleSurah(s.number, s.pagesInHizb)}
                  theme={theme}
                  styles={styles}
                  nested
                  testID={`hizb-${hizb.number}-surah-${s.number}`}
                />
                {sExpanded && (
                  <PageGrid
                    pages={s.pagesInHizb}
                    getStatus={getStatus}
                    markMode={markMode}
                    togglePage={togglePage}
                    theme={theme}
                    styles={styles}
                    nested
                  />
                )}
              </View>
            );
          })}
        </ChildGroup>
      )}
    </View>
  );
}

// ===== Page grid (leaf level) =====

interface PageGridProps {
  pages: number[];
  getStatus: (page: number) => PageStatus;
  markMode: boolean;
  togglePage: (page: number) => void;
  theme: ThemeColors;
  styles: Styles;
  nested?: boolean;
}

function PageGrid(props: PageGridProps) {
  const { isNew } = useDesign();
  return isNew ? <PageGridV2 {...props} /> : <ClassicPageGrid {...props} />;
}

function ClassicPageGrid({
  pages,
  getStatus,
  markMode,
  togglePage,
  theme,
  styles,
}: PageGridProps) {
  return (
    <View style={styles.pageGridWrap}>
      <Text style={styles.pageGridHint}>
        {markMode ? 'Tap a page to toggle' : 'Memorized pages shown in accent'}
      </Text>
      <View style={styles.pageGrid}>
        {pages.map((p) => {
          const isMemorized = getStatus(p) === 'memorized';
          const Wrapper = markMode ? PressableScale : View;
          const props = markMode
            ? {
                onPress: () => togglePage(p),
                haptic: 'selection' as const,
                scale: 0.92,
              }
            : {};
          return (
            <Wrapper
              key={`pg-${p}`}
              {...(props as any)}
              style={[
                styles.pageChip,
                isMemorized && { backgroundColor: theme.accent },
              ]}
            >
              <Text
                style={[
                  styles.pageChipText,
                  { color: theme.textSecondary },
                  isMemorized && {
                    color: theme.textInverse,
                    fontWeight: '700',
                  },
                ]}
              >
                {p}
              </Text>
            </Wrapper>
          );
        })}
      </View>
    </View>
  );
}

// ===== Groups =====

/** A list of rows: a glass card (classic), or rows straight on the ground (new design). */
function ListGroup({ styles, children }: { styles: Styles; children: React.ReactNode }) {
  const { isNew } = useDesign();
  if (isNew) return <View testID="memorization-list">{children}</View>;
  return (
    <View style={styles.listGroup}>
      <GlassCard style={StyleSheet.absoluteFillObject} />
      {children}
    </View>
  );
}

/** The surahs inside an open juz or hizb: a tinted group (classic), indented rows (new design). */
function ChildGroup({ styles, children }: { styles: Styles; children: React.ReactNode }) {
  const { isNew } = useDesign();
  return <View style={isNew ? undefined : styles.childGroup}>{children}</View>;
}

// ===== The new design =====

const BROWSER_MODES_V2: { value: BrowserMode; label: string }[] = [
  { value: 'chapter', label: 'Surahs' },
  { value: 'juz', label: 'Juz' },
  { value: 'hizb', label: 'Hizb' },
];

function ControlsV2({
  mode,
  onMode,
  markMode,
  onMarkMode,
}: {
  mode: BrowserMode;
  onMode: (mode: BrowserMode) => void;
  markMode: boolean;
  /** Absent when the screen hosts the edit button itself. */
  onMarkMode?: () => void;
}) {
  const { palette } = useTheme();
  return (
    <View style={[v2s.controls, { borderBottomColor: palette.separator }]}>
      <View style={v2s.flex}>
        <PillTabs<BrowserMode> options={BROWSER_MODES_V2} value={mode} onChange={onMode} testID="browser-modes" />
      </View>
      {onMarkMode ? (
        <IconButton
          icon={markMode ? 'checkmark' : 'create-outline'}
          label={markMode ? 'Done marking' : 'Mark memorized pages'}
          onPress={onMarkMode}
          testID="browser-mark-toggle"
        />
      ) : null}
    </View>
  );
}

/** Mark mode's checkbox: a ring, the primary fill with a check (all), or a dash (some). */
function CheckV2({
  state,
  onPress,
  label,
  testID,
}: {
  state: 'empty' | 'partial' | 'full';
  onPress?: () => void;
  label: string;
  testID?: string;
}) {
  const { palette } = useTheme();
  const haptics = useHaptics();
  const full = state === 'full';
  const partial = state === 'partial';
  return (
    <Tap
      onPress={
        onPress
          ? () => {
              haptics.selection();
              onPress();
            }
          : undefined
      }
      disabled={!onPress}
      hitSlop={8}
      accessibilityRole="checkbox"
      accessibilityLabel={`${label} memorized`}
      accessibilityState={{ checked: full ? true : partial ? 'mixed' : false }}
      style={[
        v2s.check,
        { borderColor: full || partial ? palette.primary : palette.secondary },
        full && { backgroundColor: palette.primary },
      ]}
      testID={testID}
    >
      {full ? (
        <Ionicons name="checkmark" size={16} color={palette.onPrimary} />
      ) : partial ? (
        <Ionicons name="remove" size={16} color={palette.primary} />
      ) : null}
    </Tap>
  );
}

/**
 * A surah, juz or hizb in the new design: its number in a mark (the "done"
 * check once every page is memorized), its name and details, the Arabic name,
 * and a thin bar while partly memorized. In mark mode a checkbox leads.
 */
function BaseRowV2({
  number,
  englishTitle,
  englishSub,
  englishSubAlt,
  arabic,
  expanded,
  markMode,
  checkState,
  progress,
  onPress,
  onCheckPress,
  nested,
  testID,
}: BaseRowProps) {
  const { palette } = useTheme();
  const sub = [englishSub, englishSubAlt].filter(Boolean).join(' · ');
  const partial = checkState === 'partial';
  const state =
    checkState === 'full'
      ? 'memorized'
      : partial
        ? typeof progress === 'number'
          ? `${Math.round(progress * 100)}% memorized`
          : 'partly memorized'
        : 'not memorized';
  return (
    <View style={[v2s.rowWrap, { borderBottomColor: palette.separator }]}>
      <View style={[v2s.row, nested && v2s.nestedRow]}>
        {markMode ? (
          <CheckV2 state={checkState} onPress={onCheckPress} label={englishTitle} testID={testID ? `${testID}-check` : undefined} />
        ) : null}
        <Tap
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={[englishTitle, sub, state].filter(Boolean).join(', ')}
          accessibilityState={{ expanded }}
          style={v2s.rowTap}
          testID={testID}
        >
          <Mark size={nested ? 'nested' : 'reply'} label={String(number)} done={checkState === 'full'} />
          <View style={v2s.main}>
            <Text style={[typeV2.name, { color: palette.text }]}>{englishTitle}</Text>
            {sub ? <Text style={[typeV2.meta, { color: palette.secondary }]}>{sub}</Text> : null}
            {partial && typeof progress === 'number' && progress > 0 ? (
              <View style={v2s.progress}>
                <ProgressBar progress={progress * 100} height={3} />
              </View>
            ) : null}
          </View>
          {arabic ? (
            <Text style={[arabicV2(20), v2s.arabic, { color: palette.text }]} accessibilityLanguage="ar">
              {arabic}
            </Text>
          ) : null}
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={palette.secondary} />
        </Tap>
      </View>
    </View>
  );
}

/** An open surah's pages: memorized ones filled ("done"); tappable in mark mode. */
function PageGridV2({ pages, getStatus, markMode, togglePage, nested }: PageGridProps) {
  const { palette } = useTheme();
  const haptics = useHaptics();
  return (
    <View style={[v2s.grid, nested && v2s.nestedGrid, { borderBottomColor: palette.separator }]}>
      <Text style={[typeV2.meta, { color: palette.secondary }]}>
        {markMode ? 'Tap a page to mark it memorized, or not' : 'Memorized pages are filled'}
      </Text>
      <View style={v2s.chips}>
        {pages.map((p) => {
          const on = getStatus(p) === 'memorized';
          const style = [v2s.chip, { backgroundColor: on ? palette.done : palette.fill }];
          const label = (
            <Text
              style={[typeV2.meta, typeV2.numeral, on && v2s.chipOn, { color: on ? palette.onDone : palette.text }]}
              maxFontSizeMultiplier={1.6}
            >
              {p}
            </Text>
          );
          return markMode ? (
            <Tap
              key={`pg-${p}`}
              onPress={() => {
                haptics.selection();
                togglePage(p);
              }}
              accessibilityRole="checkbox"
              accessibilityLabel={`Page ${p}`}
              accessibilityState={{ checked: on }}
              style={style}
              testID={`page-chip-${p}`}
            >
              {label}
            </Tap>
          ) : (
            <View
              key={`pg-${p}`}
              style={style}
              accessible
              accessibilityLabel={`Page ${p}, ${on ? 'memorized' : 'not memorized'}`}
              testID={`page-chip-${p}`}
            >
              {label}
            </View>
          );
        })}
      </View>
    </View>
  );
}

// The new design: full-width rows with a 16pt gutter on hairlines; a surah
// inside a juz or hizb is indented by a mark's width.
const NESTED_INDENT = markV2.nested;

const v2s = StyleSheet.create({
  flex: { flex: 1 },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: layoutV2.gutter,
    paddingVertical: 12,
    borderBottomWidth: layoutV2.hairline,
  },
  rowWrap: { borderBottomWidth: layoutV2.hairline },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: layoutV2.gutter },
  nestedRow: { paddingLeft: layoutV2.gutter + NESTED_INDENT },
  rowTap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: layoutV2.markGap,
    minHeight: 60,
    paddingVertical: 10,
    paddingRight: layoutV2.gutter,
  },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  main: { flex: 1, minWidth: 0 },
  progress: { marginTop: 6 },
  arabic: { maxWidth: 120, textAlign: 'right' },
  grid: {
    paddingHorizontal: layoutV2.gutter,
    paddingTop: 10,
    paddingBottom: 14,
    gap: 8,
    borderBottomWidth: layoutV2.hairline,
  },
  nestedGrid: { paddingLeft: layoutV2.gutter + NESTED_INDENT },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    minWidth: 44,
    minHeight: 32,
    paddingHorizontal: 6,
    borderRadius: radiusV2.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipOn: { fontWeight: '600' },
});

const makeStyles = (theme: ThemeColors, isDark: boolean) =>
  StyleSheet.create({
    controlRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    toggleWrap: { flex: 1 },
    markToggle: {
      width: 40,
      height: 40,
      borderRadius: radius.full,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark
        ? 'rgba(255,255,255,0.06)'
        : 'rgba(0,0,0,0.04)',
    },
    listGroup: {
      borderRadius: radius.md,
      overflow: 'hidden',
    },
    rowWrap: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      gap: spacing.xs,
    },
    checkboxCol: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingRight: spacing.xs,
    },
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: radius.xs,
      borderWidth: 1.5,
      borderColor: theme.border,
      backgroundColor: isDark
        ? 'rgba(255,255,255,0.06)'
        : 'rgba(0,0,0,0.04)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowNumber: {
      ...typography.titleSmall,
      color: theme.textMuted,
      width: 28,
      textAlign: 'center',
    },
    rowMain: { flex: 1, marginLeft: spacing.xs },
    rowTitle: {
      ...typography.titleMedium,
      color: theme.textPrimary,
    },
    rowSub: {
      ...typography.caption,
      color: theme.textSecondary,
      marginTop: 2,
    },
    rowSubAlt: {
      ...typography.caption,
      color: theme.textMuted,
      marginTop: 2,
    },
    rowArabic: {
      fontFamily: fonts.arabic,
      fontSize: 22,
      lineHeight: 30,
      color: theme.textPrimary,
      maxWidth: 110,
      textAlign: 'right',
      marginHorizontal: spacing.xs,
    },
    progressTrack: {
      height: 2,
      marginHorizontal: spacing.md,
      marginBottom: spacing.xs,
      backgroundColor: theme.border,
      borderRadius: radius.full,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      borderRadius: radius.full,
    },
    childGroup: {
      paddingLeft: spacing.sm,
      backgroundColor: isDark
        ? 'rgba(255,255,255,0.02)'
        : 'rgba(0,0,0,0.015)',
    },
    pageGridWrap: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.border,
    },
    pageGridHint: {
      ...typography.caption,
      color: theme.textMuted,
      marginBottom: spacing.xs,
    },
    pageGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
    },
    pageChip: {
      width: 44,
      height: 32,
      borderRadius: radius.xs,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark
        ? 'rgba(255,255,255,0.06)'
        : 'rgba(0,0,0,0.04)',
    },
    pageChipText: {
      ...typography.bodySmall,
      fontWeight: '500',
    },
  });
