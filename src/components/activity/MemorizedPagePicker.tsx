// The Memorized picker (MEM-8, Revisely Dev; Majd's option 1, Nov 23 2026): the page where the user left
// off, what is memorized faded. A tap on the ayah they reached fills from the start to there, another
// moves it, a hold starts there. It is its own sheet with its own page arrows, "independent" of the
// reader as he asked: no swipe, mic, timer, audio or verse menu, and it never moves the reader's place.
// A page that isn't on the phone, and VoiceOver, get the same choice as a list of first words.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type GestureResponderEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Sheet } from '../v2/Sheet';
import { Tap } from '../v2/Tap';
import { RangePickerSheet } from '../memorization/RangePickerSheet';
import { useQuranWordsWhen } from '../reciteMemory/TakeRows';
import { useTheme } from '../../context/ThemeContext';
import { ayahAt } from '../../lib/ayahBounds';
import { ayahKey, ayahOf, ayahsOnPage, suraOf, type AyahKey } from '../../lib/ayahKeys';
import {
  chosenAyahs,
  clearPage,
  leftOffPage,
  pageOfSurah,
  pageWord,
  reachAyah,
  startAtAyah,
  surahOfPage,
  wholePage,
  type AyahPick,
} from '../../lib/memorizedPick';
import { fitPage } from '../../lib/pageFit';
import type { QuranWords } from '../../lib/recite/quranWords';
import { arabicFullV2, layoutV2, typeV2 } from '../../theme/v2';
import { t } from '../../i18n';
import { MemorizedPageArt } from './MemorizedPageArt';

const MAX_SCALE = 1.3;
/** The sheet's grab handle, two-line header and a little air. */
const HEADER_ROOM = 104;

/** The first words of an ayah, as printed. */
export function firstWordsOf(words: QuranWords | null, key: AyahKey, count = 4): string | null {
  if (!words) return null;
  const [from, to] = words.verseRange(suraOf(key), ayahOf(key));
  const out: string[] = [];
  for (let i = from; i < Math.min(to, from + count); i++) out.push(words.uthmani(i));
  return out.join(' ');
}

function useScreenReader(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isScreenReaderEnabled?.()
      ?.then((v) => live && setOn(v))
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener?.('screenReaderChanged', setOn);
    return () => {
      live = false;
      sub?.remove?.();
    };
  }, []);
  return on;
}

/** The page's ayahs as rows, each by its first words: the same choice without the picture. */
function AyahList({
  page,
  words,
  memorized,
  chosen,
  onTap,
  onHold,
  note,
}: {
  page: number;
  words: QuranWords | null;
  memorized: ReadonlySet<AyahKey>;
  chosen: ReadonlySet<AyahKey>;
  onTap: (key: AyahKey) => void;
  onHold: (key: AyahKey) => void;
  note: boolean;
}) {
  const { palette } = useTheme();
  return (
    <ScrollView style={styles.flex} testID="memorized-picker-list">
      {note ? (
        <View style={styles.note}>
          <Ionicons name="cloud-download-outline" size={16} color={palette.secondary} />
          <Text style={[typeV2.meta, styles.flex, { color: palette.secondary }]}>{t('activity.pick.notDownloaded')}</Text>
        </View>
      ) : null}
      {ayahsOnPage(page).map((key) => {
        const done = memorized.has(key);
        const on = chosen.has(key);
        const text = firstWordsOf(words, key) ?? t('activity.ayahFields.ayahN', { n: ayahOf(key) });
        return (
          <Tap
            key={key}
            onPress={() => onTap(key)}
            onLongPress={() => onHold(key)}
            disabled={done}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: done || on, disabled: done }}
            accessibilityLabel={done ? `${text}, ${t('activity.pick.memorizedRow')}` : text}
            accessibilityActions={done ? undefined : [{ name: 'longpress', label: t('activity.pick.startHere') }]}
            onAccessibilityAction={(e) => {
              if (e.nativeEvent.actionName === 'longpress') onHold(key);
            }}
            style={[styles.row, { borderBottomColor: palette.separator }]}
            testID={`memorized-picker-ayah-${key}`}
          >
            <Ionicons
              name={done || on ? 'checkmark-circle' : 'ellipse-outline'}
              size={24}
              color={done ? palette.separator : on ? palette.accentText : palette.secondary}
            />
            {done ? (
              <Text style={[typeV2.meta, styles.rowNote, { color: palette.secondary }]} maxFontSizeMultiplier={MAX_SCALE}>
                {t('activity.pick.memorizedRow')}
              </Text>
            ) : null}
            <Text
              style={[arabicFullV2(20), styles.rowWords, { color: done ? palette.secondary : palette.text }]}
              numberOfLines={1}
            >
              {text}
            </Text>
          </Tap>
        );
      })}
    </ScrollView>
  );
}

export function MemorizedPagePicker({
  visible,
  onClose,
  onDone,
  pick,
  openPage,
  memorized,
  lo,
  hi,
}: {
  visible: boolean;
  onClose: () => void;
  onDone: (pick: AyahPick | null) => void;
  /** What is chosen so far. */
  pick: AyahPick | null;
  /** The page it opens on. */
  openPage: number;
  memorized: ReadonlySet<AyahKey>;
  /** The pages it can reach (a sitting's, or all of them). */
  lo: number;
  hi: number;
}) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [draft, setDraft] = useState<AyahPick | null>(pick);
  const [page, setPage] = useState(openPage);
  const [area, setArea] = useState({ width: 0, height: 0 });
  const [missingPage, setMissingPage] = useState<number | null>(null);
  const [jumping, setJumping] = useState(false);
  const screenReader = useScreenReader();
  const words = useQuranWordsWhen(visible);

  useEffect(() => {
    if (!visible) return;
    setDraft(pick);
    setPage(openPage);
    setMissingPage(null);
    // Only when it opens: a Done or a Cancel decides what comes back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const chosen = useMemo(() => new Set(chosenAyahs(draft, memorized)), [draft, memorized]);
  const here = useMemo(() => ayahsOnPage(page), [page]);
  const open = here.filter((k) => !memorized.has(k));
  const chosenHere = here.filter((k) => chosen.has(k));
  const lastHere = chosenHere[chosenHere.length - 1];
  const toEnd = chosenHere.length > 0 && lastHere === here[here.length - 1];
  const showList = screenReader || missingPage === page;
  const size = fitPage(area.width, area.height);
  const onMissing = useCallback(() => setMissingPage(page), [page]);

  const tapAyah = (key: AyahKey) => setDraft((d) => reachAyah(d, key, page, memorized));
  const holdAyah = (key: AyahKey) => setDraft((d) => startAtAyah(d, key, memorized));
  const atPoint = (e: GestureResponderEvent): AyahKey | null => {
    if (size.scale <= 0) return null;
    const hit = ayahAt(page, e.nativeEvent.locationX / size.scale, e.nativeEvent.locationY / size.scale);
    return hit ? ayahKey(hit.sura, hit.ayah) : null;
  };

  const headline =
    open.length === 0 ? t('activity.pick.pageDone') : chosenHere.length === 0 ? t('activity.pick.tapHint') : toEnd ? t('activity.pick.toEnd', { count: chosenHere.length }) : t('activity.pick.upTo', { count: chosenHere.length });
  const stoppedWords = chosenHere.length > 0 && !toEnd ? firstWordsOf(words, lastHere) : null;
  const sub =
    open.length === 0
      ? null
      : chosenHere.length === 0
        ? open.length < here.length
          ? t('activity.pick.fadedHint')
          : t('activity.pick.holdHint')
        : toEnd && page < hi
          ? t('activity.pick.goOn', { page: pageWord(page + 1) })
          : t('activity.pick.moveHint');

  const arrow = (to: number, icon: 'chevron-back' | 'chevron-forward', testID: string) =>
    to < lo || to > hi ? (
      <View style={styles.arrowGap} />
    ) : (
      <Tap
        onPress={() => setPage(to)}
        accessibilityRole="button"
        accessibilityLabel={t('activity.pick.goToPage', { page: pageWord(to) })}
        style={[styles.arrow, { borderColor: palette.separator }]}
        testID={testID}
      >
        {icon === 'chevron-back' ? <Ionicons name={icon} size={14} color={palette.text} /> : null}
        <Text style={[typeV2.meta, styles.arrowText, { color: palette.text }]} numberOfLines={1} maxFontSizeMultiplier={MAX_SCALE}>
          {pageWord(to)}
        </Text>
        {icon === 'chevron-forward' ? <Ionicons name={icon} size={14} color={palette.text} /> : null}
      </Tap>
    );

  const canJump = lo === 1 && hi === 604;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={surahOfPage(page)}
      message={t('activity.pick.message')}
      messageMaxScale={1.2}
      left={{ label: t('common.cancel'), onPress: onClose }}
      right={{
        label: t('common.done'),
        onPress: () => {
          onDone(draft);
          onClose();
        },
        strong: true,
        accent: true,
        disabled: draft == null && pick == null,
        testID: 'memorized-picker-done',
      }}
      testID="memorized-picker"
    >
      <View style={[styles.body, { height: height * 0.9 - HEADER_ROOM - Math.max(insets.bottom, layoutV2.gutter) }]}>
        <View
          style={styles.area}
          onLayout={(e) => setArea({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
        >
          {showList ? (
            <AyahList page={page} words={words} memorized={memorized} chosen={chosen} onTap={tapAyah} onHold={holdAyah} note={missingPage === page} />
          ) : area.width > 0 ? (
            <Pressable
              onPress={(e) => {
                const key = atPoint(e);
                if (key != null) tapAyah(key);
              }}
              onLongPress={(e) => {
                const key = atPoint(e);
                if (key != null) holdAyah(key);
              }}
              delayLongPress={350}
              accessibilityRole="image"
              accessibilityLabel={pageOfSurah(page)}
              // Touches are read from the image's left edge, in either language.
              style={{ direction: 'ltr', width: size.width, height: size.height }}
              testID="memorized-picker-page"
            >
              <MemorizedPageArt key={page} page={page} size={size} memorized={memorized} chosen={chosen} onMissing={onMissing} />
            </Pressable>
          ) : null}
        </View>

        {/* A mushaf's order in either language: the next page is on the left. */}
        <View style={styles.nav}>
          {arrow(page + 1, 'chevron-back', 'memorized-picker-next')}
          <Tap
            onPress={() => setJumping(true)}
            disabled={!canJump}
            accessibilityRole={canJump ? 'button' : 'text'}
            accessibilityLabel={canJump ? t('activity.pick.jump', { page: pageOfSurah(page) }) : pageOfSurah(page)}
            style={styles.where}
            testID="memorized-picker-where"
          >
            <Text style={[typeV2.meta, { color: palette.secondary }]} numberOfLines={1} maxFontSizeMultiplier={MAX_SCALE}>
              {pageOfSurah(page)}
            </Text>
            {canJump ? <Ionicons name="chevron-down" size={13} color={palette.secondary} /> : null}
          </Tap>
          {arrow(page - 1, 'chevron-forward', 'memorized-picker-prev')}
        </View>

        <View style={[styles.bar, { backgroundColor: palette.bubble }]}>
          <View style={styles.flex}>
            <View style={styles.line}>
              <Text style={[typeV2.name, { color: palette.text }]} maxFontSizeMultiplier={MAX_SCALE} testID="memorized-picker-headline">
                {headline}
              </Text>
              {stoppedWords ? (
                <Text style={[arabicFullV2(16), styles.words, { color: palette.text }]} numberOfLines={1} maxFontSizeMultiplier={MAX_SCALE}>
                  {`«${stoppedWords}»`}
                </Text>
              ) : null}
            </View>
            {sub ? (
              <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={MAX_SCALE}>
                {sub}
              </Text>
            ) : null}
          </View>
          {chosenHere.length < open.length ? (
            <Tap
              onPress={() => setDraft((d) => wholePage(d, page, memorized))}
              accessibilityRole="button"
              accessibilityLabel={t('activity.pick.wholePage')}
              style={[styles.pill, { backgroundColor: palette.raised }]}
              testID="memorized-picker-whole"
            >
              <Text style={[typeV2.meta, styles.pillText, { color: palette.text }]} maxFontSizeMultiplier={MAX_SCALE}>
                {t('activity.pick.wholePage')}
              </Text>
            </Tap>
          ) : null}
          {chosenHere.length > 0 ? (
            <Tap
              onPress={() => setDraft((d) => clearPage(d, page))}
              accessibilityRole="button"
              accessibilityLabel={t('activity.pick.clear')}
              style={[styles.pill, { backgroundColor: palette.raised }]}
              testID="memorized-picker-clear"
            >
              <Text style={[typeV2.meta, styles.pillText, { color: palette.text }]} maxFontSizeMultiplier={MAX_SCALE}>
                {t('activity.pick.clear')}
              </Text>
            </Tap>
          ) : null}
        </View>
      </View>

      <RangePickerSheet
        visible={jumping}
        onClose={() => setJumping(false)}
        useLabel={t('activity.pick.go')}
        onUse={(r) => setPage(leftOffPage(memorized, r.from, r.to))}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { paddingTop: 6 },
  area: { flex: 1, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
  nav: { direction: 'ltr', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8 },
  arrow: { flexDirection: 'row', alignItems: 'center', gap: 3, minHeight: 36, paddingHorizontal: 10, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, maxWidth: '36%' },
  arrowGap: { width: 36 },
  arrowText: { fontWeight: '600', flexShrink: 1 },
  where: { flexDirection: 'row', alignItems: 'center', gap: 3, minHeight: 36, flexShrink: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, padding: 12, borderRadius: 14 },
  line: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 6 },
  words: { writingDirection: 'rtl', flexShrink: 1 },
  pill: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 18 },
  pillText: { fontWeight: '600' },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 46, borderBottomWidth: StyleSheet.hairlineWidth },
  rowNote: { flexShrink: 0 },
  rowWords: { flex: 1, textAlign: 'right', writingDirection: 'rtl' },
});
