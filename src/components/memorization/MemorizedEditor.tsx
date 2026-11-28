// The memorized pages in Settings' style (MEM-9; Majd, Nov 27 2026: "the new memorized editor screen thing shown in the
// mocks, fits revisely style way better"). Flat Settings rows: a circle where a Settings row has its icon (it marks the whole
// surah, juz or hizb), the label and what it holds, a grey value (All, "12 of 20"), and › to open it. An opened juz or hizb
// is a page of its own: Whole juz as a switch, then its surahs, each with its pages counted within the surah (page first:
// the app names a page by its place in its surah). Drafts until Save (MemorizedPagesScreen).

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useHaptics } from '../../design/haptics';
import { JuzDots } from '../v2/JuzDots';
import { PillButton } from '../v2/PillButton';
import { Tap } from '../v2/Tap';
import { SettingSwitch } from '../settings/SettingSwitch';
import { layoutV2, typeV2 } from '../../theme/v2';
import {
  getAllHizbs,
  getAllSurahs,
  getJuzRange,
  getPagesForHizb,
  getPagesForJuz,
  getPagesForSurah,
  getSurahsInHizb,
  getSurahsInJuz,
} from '../../lib/quranData';
import { describePageRange, describePassage, spokenText } from '../../lib/passages';
import { forwardIcon } from '../../i18n/direction';
import { formatNumber, t } from '../../i18n';
import { checkStateOf } from './useMemorizationToggles';
import type { PageStatus } from '../../lib/memorizationChanges';

export type MemorizedMode = 'chapter' | 'juz' | 'hizb';

/** A surah, juz or hizb opened on its own page. */
export interface MemorizedGroup {
  kind: 'surah' | 'juz' | 'hizb';
  n: number;
}

export interface MemorizedToggles {
  getStatus: (page: number) => PageStatus;
  countMemorized: (pages: number[]) => number;
  togglePage: (page: number) => void;
  toggleSurah: (surah: number, pages: number[]) => void;
  toggleScope: (pages: number[]) => void;
}

/** The title of an opened group: "Juz 26", "Hizb 3", "Al-Mulk". */
export function groupTitle(g: MemorizedGroup): string {
  if (g.kind === 'juz') return t('common.juzN', { n: g.n });
  if (g.kind === 'hizb') return t('memorization.browser.hizbN', { n: g.n });
  return getAllSurahs().find((s) => s.number === g.n)?.name ?? '';
}

function valueOf(memorized: number, total: number, empty?: string): string | undefined {
  const state = checkStateOf(memorized, total);
  if (state === 'full') return t('memorization.editor.all');
  if (state === 'partial') return t('common.nOfTotal', { n: formatNumber(memorized), total: formatNumber(total) });
  return empty;
}

// ---------------------------------------------------------------- the top: how much is memorized
export function MemorizedSummary({ pages, share, juz, juzCount, surahs, percent }: {
  /** Whole pages memorized. */
  pages: number;
  /** "17.2% of the Quran". */
  share: string;
  juz: number[];
  juzCount: string;
  surahs: number;
  percent: number;
}) {
  const { palette } = useTheme();
  return (
    <View style={[styles.summary, { borderBottomColor: palette.separator }]} testID="memorized-summary">
      <View style={styles.summaryHead}>
        <Text style={[styles.count, { color: palette.text }]} maxFontSizeMultiplier={1.4} testID="memorized-count">
          {t('common.pages', { count: pages })}
        </Text>
        <Text style={[typeV2.body, { color: palette.secondary }]} maxFontSizeMultiplier={1.4} testID="memorized-share">
          {share}
        </Text>
      </View>
      <JuzDots juz={juz} progress={percent} label={share} testID="memorized-dots" />
      <Text style={[typeV2.meta, typeV2.numeral, { color: palette.secondary }]} maxFontSizeMultiplier={1.4}>
        {t('memorization.screen.juzAndSurahs', { juz: juzCount, surahs })}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------- pieces
/** A Settings-style checkbox in a row's icon place: a ring; the primary with a check (all); a dash (some). */
function Check({ state, onPress, label, testID }: { state: 'empty' | 'partial' | 'full'; onPress: () => void; label: string; testID?: string }) {
  const { palette } = useTheme();
  const haptics = useHaptics();
  const full = state === 'full';
  const partial = state === 'partial';
  return (
    <Tap
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      hitSlop={12}
      accessibilityRole="checkbox"
      accessibilityLabel={t('memorization.browser.checkLabel', { label })}
      accessibilityState={{ checked: full ? true : partial ? 'mixed' : false }}
      style={[styles.check, { borderColor: full || partial ? palette.primary : palette.secondary }, full && { backgroundColor: palette.primary }]}
      testID={testID}
    >
      {full ? <Ionicons name="checkmark" size={16} color={palette.onPrimary} /> : partial ? <Ionicons name="remove" size={16} color={palette.primary} /> : null}
    </Tap>
  );
}

/** A row: its circle, then the label (what it holds under it), the grey value and ›, which open it. */
function GroupRow({ label, sub, value, state, onCheck, onOpen, testID }: {
  label: string;
  sub?: string;
  value?: string;
  state: 'empty' | 'partial' | 'full';
  onCheck: () => void;
  onOpen?: () => void;
  testID: string;
}) {
  const { palette } = useTheme();
  const body = (
    <>
      <View style={styles.flex}>
        <Text style={[typeV2.body, { color: palette.text }]} numberOfLines={2}>
          {label}
        </Text>
        {sub ? (
          <Text style={[typeV2.meta, { color: palette.secondary }]} numberOfLines={2}>
            {sub}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text style={[typeV2.body, styles.value, { color: palette.secondary }]} numberOfLines={1} testID={`${testID}-value`}>
          {value}
        </Text>
      ) : null}
      {onOpen ? <Ionicons name={forwardIcon()} size={16} color={palette.secondary} /> : null}
    </>
  );
  return (
    <View style={styles.row} testID={testID}>
      <Check state={state} onPress={onCheck} label={label} testID={`${testID}-check`} />
      {onOpen ? (
        <Tap
          onPress={onOpen}
          accessibilityRole="button"
          accessibilityLabel={[label, sub, value].filter(Boolean).join(', ')}
          accessibilityHint={t('memorization.editor.opensHint')}
          style={styles.rowBody}
          testID={`${testID}-open`}
        >
          {body}
        </Tap>
      ) : (
        <View style={styles.rowBody}>{body}</View>
      )}
    </View>
  );
}

/** A surah's pages as cells, each named by its place in the surah (1, 2, 3 …); a tap marks or unmarks it. */
function PageCells({ surah, pages, toggles, focus }: { surah: number; pages: number[]; toggles: MemorizedToggles; focus?: Set<number> }) {
  const { palette } = useTheme();
  const haptics = useHaptics();
  const all = getPagesForSurah(surah);
  return (
    <View style={styles.cells}>
      {pages.map((page) => {
        const on = toggles.getStatus(page) === 'memorized';
        const state = on ? t('memorization.browser.memorized') : t('memorization.browser.notMemorized');
        return (
          <Tap
            key={page}
            onPress={() => {
              haptics.selection();
              toggles.togglePage(page);
            }}
            accessibilityRole="checkbox"
            accessibilityLabel={t('memorization.editor.pageCell', { name: spokenText(describePassage([page])), state })}
            accessibilityState={{ checked: on }}
            style={[
              styles.cell,
              on ? { backgroundColor: palette.primary } : { borderWidth: 1, borderColor: palette.outline },
              focus?.has(page) && { borderWidth: 2, borderColor: palette.text },
            ]}
            testID={`memorized-page-${surah}-${page}`}
          >
            <Text style={[typeV2.meta, typeV2.numeral, styles.cellText, { color: on ? palette.onPrimary : palette.text }]} maxFontSizeMultiplier={1.4}>
              {formatNumber(all.indexOf(page) + 1)}
            </Text>
          </Tap>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------- the list
export function MemorizedList({ mode, onMode, toggles, onOpen }: {
  mode: MemorizedMode;
  onMode: (m: MemorizedMode) => void;
  toggles: MemorizedToggles;
  onOpen: (g: MemorizedGroup) => void;
}) {
  const { palette } = useTheme();
  const modes: { value: MemorizedMode; label: string }[] = [
    { value: 'chapter', label: t('memorization.browser.modes.surahs') },
    { value: 'juz', label: t('memorization.browser.modes.juz') },
    { value: 'hizb', label: t('memorization.browser.modes.hizb') },
  ];
  const { countMemorized, toggleScope, toggleSurah } = toggles;
  let rows: React.ReactNode;
  if (mode === 'juz') {
    rows = Array.from({ length: 30 }, (_, i) => i + 1).map((n) => {
      const pages = getPagesForJuz(n);
      const range = getJuzRange(n);
      const m = countMemorized(pages);
      return (
        <GroupRow
          key={n}
          label={t('common.juzN', { n })}
          sub={describePageRange(range.start, range.end, { form: 'short', wholeJuz: false })}
          value={valueOf(m, pages.length)}
          state={checkStateOf(m, pages.length)}
          onCheck={() => toggleScope(pages)}
          onOpen={() => onOpen({ kind: 'juz', n })}
          testID={`memorized-juz-${n}`}
        />
      );
    });
  } else if (mode === 'hizb') {
    rows = getAllHizbs().map((h) => {
      const pages = getPagesForHizb(h.number);
      const m = countMemorized(pages);
      return (
        <GroupRow
          key={h.number}
          label={t('memorization.browser.hizbN', { n: h.number })}
          sub={describePageRange(h.startPage, h.endPage, { form: 'short', wholeJuz: false })}
          value={valueOf(m, pages.length)}
          state={checkStateOf(m, pages.length)}
          onCheck={() => toggleScope(pages)}
          onOpen={() => onOpen({ kind: 'hizb', n: h.number })}
          testID={`memorized-hizb-${h.number}`}
        />
      );
    });
  } else {
    rows = getAllSurahs().map((s) => {
      const pages = getPagesForSurah(s.number);
      const m = countMemorized(pages);
      return (
        <GroupRow
          key={s.number}
          label={s.name}
          sub={t('common.pages', { count: pages.length })}
          value={valueOf(m, pages.length)}
          state={checkStateOf(m, pages.length)}
          onCheck={() => toggleSurah(s.number, pages)}
          onOpen={() => onOpen({ kind: 'surah', n: s.number })}
          testID={`memorized-surah-${s.number}`}
        />
      );
    });
  }
  const footer =
    mode === 'juz' ? t('memorization.editor.footerJuz') : mode === 'hizb' ? t('memorization.editor.footerHizb') : t('memorization.editor.footerSurahs');
  return (
    <View testID="memorized-list">
      <View style={[styles.showBy, { borderBottomColor: palette.separator }]}>
        <Text style={[typeV2.body, styles.flex, { color: palette.text }]}>{t('memorization.editor.showBy')}</Text>
        <View style={styles.pills}>
          {modes.map((o) => (
            <PillButton
              key={o.value}
              title={o.label}
              size="sm"
              variant={o.value === mode ? 'solid' : 'outline'}
              onPress={() => onMode(o.value)}
              accessibilityLabel={o.value === mode ? t('settings.selected', { label: o.label }) : o.label}
              testID={`memorized-mode-${o.value}`}
            />
          ))}
        </View>
      </View>
      {rows}
      <Text style={[typeV2.meta, styles.footer, { color: palette.secondary }]}>{footer}</Text>
    </View>
  );
}

// ---------------------------------------------------------------- an opened surah, juz or hizb
export function MemorizedGroupPage({ group, toggles, focus }: { group: MemorizedGroup; toggles: MemorizedToggles; focus?: Set<number> }) {
  const { palette } = useTheme();
  const { countMemorized, toggleScope, toggleSurah } = toggles;
  const pages = group.kind === 'juz' ? getPagesForJuz(group.n) : group.kind === 'hizb' ? getPagesForHizb(group.n) : getPagesForSurah(group.n);
  const all = countMemorized(pages) === pages.length;
  const wholeLabel =
    group.kind === 'juz' ? t('memorization.editor.wholeJuz') : group.kind === 'hizb' ? t('memorization.editor.wholeHizb') : t('memorization.editor.wholeSurah');
  const whole = (
    <View style={[styles.wholeRow, { borderBottomColor: palette.separator }]}>
      <View style={styles.flex}>
        <Text style={[typeV2.body, { color: palette.text }]}>{wholeLabel}</Text>
        <Text style={[typeV2.meta, { color: palette.secondary }]}>{t('memorization.editor.marksAll', { count: pages.length })}</Text>
      </View>
      <SettingSwitch
        value={all}
        onValueChange={() => (group.kind === 'surah' ? toggleSurah(group.n, pages) : toggleScope(pages))}
        accessibilityLabel={wholeLabel}
        testID="memorized-whole"
      />
    </View>
  );
  if (group.kind === 'surah') {
    return (
      <View testID={`memorized-group-surah-${group.n}`}>
        {whole}
        <View style={styles.surahPages}>
          <PageCells surah={group.n} pages={pages} toggles={toggles} focus={focus} />
        </View>
      </View>
    );
  }
  const surahs =
    group.kind === 'juz'
      ? getSurahsInJuz(group.n).map((s) => ({ number: s.number, name: s.name, pages: s.pagesInJuz }))
      : getSurahsInHizb(group.n).map((s) => ({ number: s.number, name: s.name, pages: s.pagesInHizb }));
  return (
    <View testID={`memorized-group-${group.kind}-${group.n}`}>
      {whole}
      {surahs.map((s) => {
        const m = countMemorized(s.pages);
        return (
          <View key={s.number} style={styles.surahBlock}>
            <GroupRow
              label={s.name}
              value={valueOf(m, s.pages.length, t('common.pages', { count: s.pages.length }))}
              state={checkStateOf(m, s.pages.length)}
              onCheck={() => toggleSurah(s.number, s.pages)}
              testID={`memorized-in-${group.kind}-surah-${s.number}`}
            />
            <View style={styles.underRow}>
              <PageCells surah={s.number} pages={s.pages} toggles={toggles} focus={focus} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

const CHECK = 24;
const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  summary: { paddingHorizontal: layoutV2.gutter, paddingTop: 16, paddingBottom: 14, gap: 10, borderBottomWidth: layoutV2.hairline },
  summaryHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  count: { fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: -0.4, fontVariant: ['tabular-nums'] },
  showBy: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
    minHeight: 52,
    paddingVertical: 10,
    paddingHorizontal: layoutV2.gutter,
    borderBottomWidth: layoutV2.hairline,
  },
  pills: { flexDirection: 'row', gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingStart: layoutV2.gutter, gap: 16 },
  rowBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingEnd: layoutV2.gutter },
  value: { flexShrink: 0, maxWidth: '45%' },
  check: { width: CHECK, height: CHECK, borderRadius: CHECK / 2, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  footer: { paddingHorizontal: layoutV2.gutter, paddingTop: 10, paddingBottom: 16 },
  wholeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    minHeight: 52,
    paddingVertical: 12,
    paddingHorizontal: layoutV2.gutter,
    borderBottomWidth: layoutV2.hairline,
  },
  surahBlock: { paddingBottom: 6 },
  // Under the surah's name: the circle (24) and the row's gap (16).
  underRow: { paddingStart: layoutV2.gutter + CHECK + 16, paddingEnd: layoutV2.gutter, marginTop: -4 },
  surahPages: { paddingHorizontal: layoutV2.gutter, paddingVertical: 14 },
  cells: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cell: { minWidth: 44, height: 32, paddingHorizontal: 6, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  cellText: { fontWeight: '600' },
});
