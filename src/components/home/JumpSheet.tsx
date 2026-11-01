import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { Sheet } from '../v2/Sheet';
import { PillTabs } from '../v2/PillTabs';
import { PillButton } from '../v2/PillButton';
import { Tap } from '../v2/Tap';
import { WheelPicker } from '../v2/WheelPicker';
import { layoutV2, typeV2 } from '../../theme/v2';
import { getAllSurahs, getJuzForPage, getPagesForJuz, getSurahDisplay, getSurahForPage } from '../../lib/quranData';
import { isJuzMode, jumpablePages, type JumpTarget, todayStartPage } from '../../lib/jump';
import type { User, UserPage } from '../../types';

type Tab = 'juz' | 'surah' | 'page';

const surahName = (n: number, fallback: string) => getSurahDisplay(n)?.nameDisplay ?? fallback;
const pagesText = (pages: number[]) =>
  pages.length === 1 ? `p. ${pages[0]}` : `p. ${pages[0]}–${pages[pages.length - 1]}`;

/** "Juz 12", "Al-Kahf", "p. 222": what the button and the toast call a target. */
export function targetLabel(target: JumpTarget): string {
  if (target.kind === 'juz') return `Juz ${target.juz}`;
  if (target.kind === 'surah') return surahName(target.surah, `Surah ${target.surah}`);
  return `p. ${target.page}`;
}

/**
 * "Jump to…" from Home: where today's revision starts, by juz, surah or page.
 * Only what the schedule goes through can be chosen (what's memorized, or in
 * the custom plan); where today starts now is marked. Juz a day picks a juz.
 * The days after carry on from the new start (lib/jump).
 */
export function JumpSheet({
  visible,
  onClose,
  user,
  memorized,
  revisionDate,
  onJump,
}: {
  visible: boolean;
  onClose: () => void;
  user: User;
  memorized: UserPage[];
  revisionDate: Date;
  onJump: (target: JumpTarget) => void;
}) {
  const { palette } = useTheme();
  const juzOnly = isJuzMode(user);
  const [tab, setTab] = useState<Tab>('juz');
  const [chosen, setChosen] = useState<JumpTarget | null>(null);

  const pages = useMemo(() => [...jumpablePages(user, memorized)].sort((a, b) => a - b), [user, memorized]);
  const current = useMemo(() => todayStartPage(user, revisionDate, memorized), [user, revisionDate, memorized]);
  const juzRows = useMemo(() => {
    const has = new Set(pages);
    return Array.from({ length: 30 }, (_, i) => i + 1)
      .map((juz) => ({ juz, pages: getPagesForJuz(juz).filter((p) => has.has(p)), size: getPagesForJuz(juz).length }))
      .filter((r) => r.pages.length > 0);
  }, [pages]);
  const surahRows = useMemo(() => {
    const has = new Set(pages);
    return getAllSurahs()
      .map((s) => ({
        surah: s.number,
        name: surahName(s.number, s.name),
        pages: Array.from({ length: s.endPage - s.startPage + 1 }, (_, i) => s.startPage + i).filter((p) => has.has(p)),
      }))
      .filter((r) => r.pages.length > 0);
  }, [pages]);

  // Afresh each time it opens: nothing chosen, the page wheel on today's start.
  const [wheelKey, setWheelKey] = useState(0);
  useEffect(() => {
    if (!visible) return;
    setChosen(null);
    setTab('juz');
    setWheelKey((k) => k + 1);
  }, [visible]);

  const currentJuz = current != null ? getJuzForPage(current) : null;
  const currentSurah = current != null ? getSurahForPage(current).number : null;
  const pageIndex = Math.max(0, current != null ? pages.indexOf(current) : 0);
  const pageChosen = chosen?.kind === 'page' ? chosen.page : (pages[pageIndex] ?? null);

  const choose = (t: JumpTarget) => setChosen(t);
  const isChosen = (t: JumpTarget) =>
    chosen != null &&
    chosen.kind === t.kind &&
    (t.kind === 'juz'
      ? chosen.kind === 'juz' && chosen.juz === t.juz
      : t.kind === 'surah'
        ? chosen.kind === 'surah' && chosen.surah === t.surah
        : chosen.kind === 'page' && chosen.page === t.page);
  const target: JumpTarget | null = tab === 'page' && pageChosen != null ? { kind: 'page', page: pageChosen } : chosen;
  const ready = target != null && target.kind === tab;

  const row = (t: JumpTarget, label: string, meta: string, today: boolean, testID: string) => {
    const selected = isChosen(t);
    return (
      <Tap
        key={testID}
        onPress={() => choose(t)}
        style={[styles.row, { borderBottomColor: palette.separator }]}
        accessibilityRole="radio"
        accessibilityState={{ checked: selected }}
        accessibilityLabel={`${label}. ${meta}${today ? '. Today starts here' : ''}`}
        testID={testID}
      >
        <View style={styles.rowText}>
          <Text style={[typeV2.body, styles.rowLabel, { color: palette.text }]} maxFontSizeMultiplier={1.4}>
            {label}
          </Text>
          <Text style={[typeV2.meta, typeV2.numeral, { color: palette.secondary }]} maxFontSizeMultiplier={1.4}>
            {meta}
          </Text>
        </View>
        {today ? (
          <Text style={[typeV2.meta, styles.today, { color: palette.accentText }]} maxFontSizeMultiplier={1.3}>
            Today
          </Text>
        ) : null}
        <View style={styles.check}>
          {selected ? <Ionicons name="checkmark" size={22} color={palette.accentText} /> : null}
        </View>
      </Tap>
    );
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Jump to"
      message="Today starts here and the days after follow on. Your plan stays the same."
      testID="jump-sheet"
    >
      <View style={styles.body}>
        {juzOnly ? null : (
          <View style={styles.tabs}>
            <PillTabs<Tab>
              options={[
                { value: 'juz', label: 'Juz' },
                { value: 'surah', label: 'Surah' },
                { value: 'page', label: 'Page' },
              ]}
              value={tab}
              onChange={(t) => {
                setTab(t);
                setChosen(null);
              }}
              testID="jump-tabs"
            />
          </View>
        )}
        {tab === 'page' ? (
          <View style={styles.wheel} testID="jump-pages">
            {/* A row: the wheel fills it across (its height is its own). */}
            <View style={styles.wheelRow}>
              <WheelPicker
                key={wheelKey}
                items={pages.map((p) => ({ key: String(p), label: `Page ${p}` }))}
                index={pageIndex}
                onChange={(i) => setChosen({ kind: 'page', page: pages[i] })}
                label="Page"
                testID="jump-page-wheel"
              />
            </View>
            {pageChosen != null ? (
              <Text style={[typeV2.meta, styles.centred, { color: palette.secondary }]} testID="jump-page-where">
                {`Juz ${getJuzForPage(pageChosen)} · ${surahName(getSurahForPage(pageChosen).number, getSurahForPage(pageChosen).name)}${pageChosen === current ? ' · today starts here' : ''}`}
              </Text>
            ) : null}
          </View>
        ) : (
          <ScrollView style={styles.list} testID={tab === 'juz' ? 'jump-juz-list' : 'jump-surah-list'}>
            {tab === 'juz'
              ? juzRows.map((r) =>
                  row(
                    { kind: 'juz', juz: r.juz },
                    `Juz ${r.juz}`,
                    r.pages.length === r.size ? pagesText(r.pages) : `${pagesText(r.pages)} · ${r.pages.length} of ${r.size} pages`,
                    r.juz === currentJuz,
                    `jump-juz-${r.juz}`,
                  ),
                )
              : surahRows.map((r) =>
                  row({ kind: 'surah', surah: r.surah }, r.name, pagesText(r.pages), r.surah === currentSurah, `jump-surah-${r.surah}`),
                )}
          </ScrollView>
        )}
        <View style={styles.tabs}>
          <PillButton
            title={ready ? `Start today at ${targetLabel(target!)}` : 'Choose where to start'}
            size="lg"
            disabled={!ready}
            onPress={() => target && onJump(target)}
            testID="jump-go"
          />
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: 12, paddingBottom: 8 },
  tabs: { paddingHorizontal: layoutV2.gutter },
  list: { maxHeight: 340 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingVertical: 8,
    paddingHorizontal: layoutV2.gutter,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: { flex: 1, minWidth: 0 },
  rowLabel: { fontWeight: '600' },
  today: { fontWeight: '600', marginRight: 8 },
  check: { width: 24, alignItems: 'flex-end' },
  wheel: { gap: 8, paddingHorizontal: layoutV2.gutter },
  wheelRow: { flexDirection: 'row' },
  centred: { textAlign: 'center' },
});
