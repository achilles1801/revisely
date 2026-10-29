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
import { useTheme } from '../context/ThemeContext';
import { useHaptics } from '../design/haptics';
import { ProgressBar } from './ProgressBar';
import { Mark } from './v2/Mark';
import { PillTabs } from './v2/PillTabs';
import { Tap } from './v2/Tap';
import { IconButton } from './v2/TopBar';
import { arabicV2, layoutV2, markV2, radiusV2, typeV2 } from '../theme/v2';
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
import { arabicLabelLines } from '../lib/platformUi';

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
      {/* Pills for the three lenses, then flat rows. */}
      <ControlsV2
        mode={mode}
        onMode={changeMode}
        markMode={markMode}
        onMarkMode={hideMarkToggle ? undefined : () => setMarkMode(!markMode)}
      />

      {/* List body */}
      {mode === 'chapter' && (
        <ChapterList
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
  /** A surah inside a juz or hizb: indented, a smaller mark. */
  nested?: boolean;
  testID?: string;
}

// ===== Chapter mode =====

function ChapterList({
  markMode,
  expandedKey,
  onExpand,
  countMemorized,
  togglePage,
  toggleSurah,
  getStatus,
}: {
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
    <ListGroup>
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
              testID={`surah-${s.number}`}
            />
            {isExpanded && (
              <PageGrid
                pages={surahPages}
                getStatus={getStatus}
                markMode={markMode}
                togglePage={togglePage}
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
    <ListGroup>
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
              testID={`juz-${juzNumber}`}
            />
            {isExpanded && (
              <ChildGroup>
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
                        nested
                        testID={`juz-${juzNumber}-surah-${s.number}`}
                      />
                      {sExpanded && (
                        <PageGrid
                          pages={s.pagesInJuz}
                          getStatus={getStatus}
                          markMode={markMode}
                          togglePage={togglePage}
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
    <ListGroup>
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
        testID={`hizb-${hizb.number}`}
      />
      {expanded && (
        <ChildGroup>
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
                  nested
                  testID={`hizb-${hizb.number}-surah-${s.number}`}
                />
                {sExpanded && (
                  <PageGrid
                    pages={s.pagesInHizb}
                    getStatus={getStatus}
                    markMode={markMode}
                    togglePage={togglePage}
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
  nested?: boolean;
}

// ===== Groups =====

/** A list of rows, straight on the ground. */
function ListGroup({ children }: { children: React.ReactNode }) {
  return <View testID="memorization-list">{children}</View>;
}

/** The surahs inside an open juz or hizb (each row indents itself). */
function ChildGroup({ children }: { children: React.ReactNode }) {
  return <View>{children}</View>;
}

// ===== Controls and rows =====

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
 * A surah, juz or hizb: its number in a mark (the "done"
 * check once every page is memorized), its name and details, the Arabic name,
 * and a thin bar while partly memorized. In mark mode a checkbox leads.
 */
function BaseRow({
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
          {/* While marking, the box says memorized or not; the mark keeps the number. */}
          <Mark size={nested ? 'nested' : 'reply'} label={String(number)} done={!markMode && checkState === 'full'} />
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
            <Text style={[arabicV2(20), v2s.arabic, { color: palette.text }]} accessibilityLanguage="ar" numberOfLines={arabicLabelLines}>
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
function PageGrid({ pages, getStatus, markMode, togglePage, nested }: PageGridProps) {
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

// Full-width rows with a 16pt gutter on hairlines; a surah inside a juz or
// hizb is indented by a mark's width.
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
