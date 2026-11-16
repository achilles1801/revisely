import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlatList } from 'react-native-gesture-handler';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Mark } from '../../components/v2/Mark';
import { Tap } from '../../components/v2/Tap';
import { SpeechModelSheet } from '../../components/recite/SpeechModelSheet';
import { useVoiceSearch } from '../../components/search/useVoiceSearch';
import { hitShareText, SearchVerseCard } from '../../components/search/SearchVerseCard';
import { LiveWaveform } from '../../components/recordings/LiveWaveform';
import { UndoToast } from '../../components/revision/UndoToast';
import { useHaptics } from '../../design/haptics';
import { copyText } from '../../lib/clipboard';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { arabicV2, layoutV2, typeV2 } from '../../theme/v2';
import type { ReadStackParamList } from '../../navigation/MainNavigator';
import { getJuzRange } from '../../lib/quranData';
import { surahName } from '../../lib/passages';
import { pageOfVerse } from '../../lib/verses';
import { loadQuranWords, QuranWords } from '../../lib/recite/quranWords';
import { matchedWords, searchText, VerseHit } from '../../lib/search/quranSearch';
import { hasArabic, parseReference, SearchTarget } from '../../lib/search/parseQuery';
import { addRecentSearch, clearRecentSearches, getRecentSearches } from '../../lib/search/recentSearches';
import { voiceSearchEnabled } from '../../lib/search/availability';
import { reciteLiveEnabled } from '../../lib/reciteLive/availability';
import { useMushafEdition } from '../../lib/mushafEdition';
import { logger } from '../../lib/logger';

type NavigationProp = NativeStackNavigationProp<ReadStackParamList, 'QuranSearch'>;
type RouteProps = RouteProp<ReadStackParamList, 'QuranSearch'>;

const NBSP = ' ';
/** Below this share of the query, results are the closest there is, not the words said. */
const CLOSEST = 0.75;

type Row =
  | { kind: 'target'; key: string; target: SearchTarget }
  | { kind: 'verse'; key: string; hit: VerseHit; matched: Set<number> };

interface Results {
  query: string;
  rows: Row[];
  /** Matches in the text, before the list was cut. */
  total: number;
  /** The best match in the text is only close. */
  closest: boolean;
}

/**
 * The one place a search found, when it found exactly one and not just the closest there is (the list would say
 * "1 result"): a voice search then opens the reader there ready to recite (Revisely Dev's live check). Null otherwise.
 */
export function onlyVerseFound(results: Pick<Results, 'rows' | 'total' | 'closest'>): VerseHit | null {
  if (results.closest || results.total !== 1 || results.rows.length !== 1) return null;
  const row = results.rows[0];
  return row.kind === 'verse' ? row.hit : null;
}

function verseTitle(sura: number, ayah: number): string {
  return `${surahName(sura)}, ayah${NBSP}${ayah}`;
}

function targetText(t: SearchTarget): { title: string; meta: string; icon: 'book-outline' | 'document-outline' | 'layers-outline' } {
  switch (t.kind) {
    case 'verse':
      return { title: verseTitle(t.sura, t.ayah), meta: `p.${NBSP}${pageOfVerse(t)}`, icon: 'book-outline' };
    case 'surah':
      return { title: surahName(t.sura), meta: `Surah ${t.sura} · p.${NBSP}${pageOfVerse({ sura: t.sura, ayah: 1 })}`, icon: 'book-outline' };
    case 'page':
      return { title: `Page ${t.page}`, meta: '', icon: 'document-outline' };
    case 'juz':
      return { title: `Juz${NBSP}${t.juz}`, meta: `p.${NBSP}${getJuzRange(t.juz).start}`, icon: 'layers-outline' };
  }
}

/**
 * Search the Qur'an: type a surah, an ayah ("2:255", "Yunus 16"), a page or Arabic words,
 * or (on an iPhone that can listen) tap the mic and recite a few words. Results
 * open the reader at the ayah, highlighted. Before anything is typed, the last searches.
 */
export default function QuranSearchScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { palette } = useTheme();
  const { user } = useApp();
  const uid = user?.id ?? null;
  const [text, setText] = useState('');
  const [results, setResults] = useState<Results | null>(null);
  const [words, setWords] = useState<QuranWords | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [modelSheet, setModelSheet] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const insets = useSafeAreaInsets();
  // With the keyboard up the bar sits on it, so it needs no room for the home indicator.
  const [keyboardUp, setKeyboardUp] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardUp(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardUp(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  const pending = useRef<{ query: string; voice: boolean } | null>(null);
  // Revisely Dev's live check (testers, the 1405 print): a voice search with one result opens the reader reciting.
  const reciteOn = reciteLiveEnabled(user, useMushafEdition());

  useEffect(() => {
    let live = true;
    loadQuranWords()
      .then((w) => {
        if (live) setWords(w);
      })
      .catch((err) => {
        logger.warn('Could not load the Quran words for search', err);
        if (live) setLoadFailed(true);
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!uid) return;
    let live = true;
    getRecentSearches(uid).then((list) => {
      if (live) setRecent(list);
    });
    return () => {
      live = false;
    };
  }, [uid]);

  const open = useCallback(
    (pageNumber: number, highlight?: ReadStackParamList['QuranReader']['highlight'], recite = false) => {
      Keyboard.dismiss();
      navigation.push('QuranReader', { pageNumber, source: 'search', highlight, ...(recite ? { recite: true } : {}) });
    },
    [navigation],
  );

  const run = useCallback(
    (query: string, w: QuranWords | null, voice = false) => {
      const q = query.trim();
      if (!q) {
        setResults(null);
        return;
      }
      if (!w && hasArabic(q)) {
        // Searched before the words have loaded: once they have.
        pending.current = { query: q, voice };
        return;
      }
      const rows: Row[] = parseReference(q).map((target, i) => ({ kind: 'target', key: `t${i}`, target }));
      let total = 0;
      let closest = false;
      if (w && hasArabic(q)) {
        const found = searchText(w, q);
        total = found.total;
        closest = found.hits.length > 0 && found.hits[0].score < CLOSEST;
        for (const hit of found.hits) {
          rows.push({ kind: 'verse', key: `v${hit.from}`, hit, matched: matchedWords(w, hit, found.words) });
        }
      }
      setResults({ query: q, rows, total, closest });
      if (uid) addRecentSearch(uid, q).then(setRecent);
      // Searched by voice with one place found (Majd, Nov 15 2026: "take them to that page as if they're about to recite
      // it"): the reader opens there and starts reciting, looking for where the reciter goes on. Only after a voice
      // search (the person was already speaking to the app), never a typed one; several results stay a list.
      const only = voice && reciteOn ? onlyVerseFound({ rows, total, closest }) : null;
      if (only) open(pageOfVerse(only), { sura: only.sura, ayah: only.ayah, last: only.last }, true);
    },
    [uid, reciteOn, open],
  );

  useEffect(() => {
    if (words && pending.current) {
      const { query, voice } = pending.current;
      pending.current = null;
      run(query, words, voice);
    }
  }, [words, run]);

  const voice = useVoiceSearch((heard) => {
    setText(heard);
    run(heard, words, true);
  }, voiceSearchEnabled(user));

  const startListening = useCallback(() => {
    if (!voice.available) return;
    Keyboard.dismiss();
    if (voice.needsModel) {
      setModelSheet(true);
      return;
    }
    void voice.listen();
  }, [voice]);

  // Opened from the mic on the Read tab: listen at once (where voice search is on).
  const listenOnOpen = route.params?.listen === true && voice.available;
  useEffect(() => {
    if (listenOnOpen) {
      startListening();
      return;
    }
    // The field is focused once the screen has slid in: a keyboard raised during the transition left the bar under it
    // (iPhone SE, Nov 16 2026).
    let done = false;
    const focus = () => {
      if (done) return;
      done = true;
      inputRef.current?.focus();
    };
    const unsubscribe = navigation.addListener?.('transitionEnd', focus);
    const fallback = setTimeout(focus, 650);
    return () => {
      done = true;
      unsubscribe?.();
      clearTimeout(fallback);
    };
    // Once, on opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openTarget = useCallback(
    (t: SearchTarget) => {
      if (t.kind === 'verse') open(pageOfVerse(t), { sura: t.sura, ayah: t.ayah });
      else if (t.kind === 'surah') open(pageOfVerse({ sura: t.sura, ayah: 1 }));
      else if (t.kind === 'page') open(t.page);
      else open(getJuzRange(t.juz).start);
    },
    [open],
  );

  const listening = voice.status === 'listening' || voice.status === 'starting';
  const thinking = voice.status === 'thinking';

  const status = useMemo(() => {
    if (voice.status === 'denied') return 'Microphone access is off. Turn it on in Settings to search by voice.';
    if (voice.status === 'error') return 'Couldn’t listen. Try again.';
    if (loadFailed) return 'Couldn’t load the Quran’s text. Try again later.';
    return null;
  }, [voice.status, loadFailed]);

  // Share and Copy on a result: the ayat as shown (the word data on the phone), "Copied" for a moment.
  const haptics = useHaptics();
  const [note, setNote] = useState<string | null>(null);
  const copyHit = useCallback(
    (hit: VerseHit) => {
      if (!words) return;
      copyText(hitShareText(words, hit));
      haptics.light();
      setNote('Copied');
      AccessibilityInfo.announceForAccessibility('Copied');
    },
    [words, haptics],
  );
  const shareHit = useCallback(
    (hit: VerseHit) => {
      if (!words) return;
      Share.share({ message: hitShareText(words, hit) }).catch((err) => logger.warn('Could not share the verse', err));
    },
    [words],
  );

  // The header: back and the title. The field and the mic are at the bottom, in reach of a thumb (Majd, Nov 16 2026:
  // "the mic button being top right is annoying to have to reach up there just to end the check").
  const header = (
    <View style={styles.header}>
      <Tap onPress={() => navigation.goBack()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back" testID="search-back">
        <Ionicons name="chevron-back" size={26} color={palette.text} />
      </Tap>
      <Text style={[typeV2.name, styles.headerTitle, { color: palette.text }]} accessibilityRole="header" maxFontSizeMultiplier={1.4}>
        Search
      </Text>
      <View style={styles.headerSide} />
    </View>
  );

  const bar = (
    <View
      style={[styles.bar, { borderTopColor: palette.separator, backgroundColor: palette.bg, paddingBottom: keyboardUp ? 10 : Math.max(10, insets.bottom) }]}
      testID="search-bar"
    >
      <View style={[styles.field, { backgroundColor: palette.fill }]}>
        <Ionicons name="search" size={18} color={palette.secondary} />
        <TextInput
          ref={inputRef}
          value={text}
          onChangeText={(t) => {
            setText(t);
            if (!t.trim()) setResults(null);
          }}
          onSubmitEditing={() => run(text, words)}
          placeholder="Surah, 2:255, page 62, or words"
          placeholderTextColor={palette.secondary}
          style={[typeV2.body, styles.input, { color: palette.text }]}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          clearButtonMode="never"
          accessibilityLabel="Search the Quran"
          maxFontSizeMultiplier={1.6}
          testID="search-input"
        />
        {text !== '' ? (
          <Tap
            onPress={() => {
              setText('');
              setResults(null);
              inputRef.current?.focus();
            }}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            testID="search-clear"
          >
            <Ionicons name="close-circle" size={18} color={palette.secondary} />
          </Tap>
        ) : null}
      </View>
      {voice.available ? (
        <Tap
          onPress={listening ? voice.stop : startListening}
          // Not while it gets ready (the microphone prompt) or reads what was said.
          disabled={thinking || voice.status === 'starting'}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={listening ? 'Stop listening' : 'Search by voice'}
          style={[styles.mic, { backgroundColor: listening ? palette.red : palette.primary }]}
          testID="search-mic"
        >
          {listening ? (
            <View style={[styles.stopSquare, { backgroundColor: palette.onRedFill }]} />
          ) : thinking ? (
            <ActivityIndicator color={palette.onPrimary} />
          ) : (
            <Ionicons name="mic" size={26} color={palette.onPrimary} />
          )}
        </Tap>
      ) : null}
    </View>
  );

  let body: React.ReactNode;
  if (listening || thinking) {
    body = (
      <View style={styles.listening} testID="search-listening">
        <Text style={[typeV2.body, { color: palette.secondary }]} maxFontSizeMultiplier={1.4}>
          {thinking ? 'Searching…' : voice.status === 'starting' ? 'Getting ready…' : 'Listening… recite any words of an ayah'}
        </Text>
        <View style={styles.transcriptBox}>
          {voice.partial ? (
            <Text style={[arabicV2(30), styles.arabic, { color: palette.text }]} accessibilityLanguage="ar" testID="search-partial">
              {voice.partial}
            </Text>
          ) : null}
        </View>
        {listening ? (
          <View style={styles.wave} testID="search-wave">
            <LiveWaveform levels={voice.levels} color={palette.primary} maxHeight={44} />
          </View>
        ) : null}
      </View>
    );
  } else if (results) {
    const count = results.rows.length;
    const heading =
      count === 0
        ? null
        : results.closest && results.rows.every((r) => r.kind === 'verse')
          ? 'Closest matches'
          : results.total > results.rows.filter((r) => r.kind === 'verse').length
            ? `${results.total} results, the first ${results.rows.length} shown`
            : count === 1
              ? '1 result'
              : `${count} results`;
    body = (
      <FlatList
        data={results.rows}
        keyExtractor={(r) => r.key}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.resultsHead}>
            {hasArabic(results.query) ? (
              <Text style={[arabicV2(20), styles.arabic, { color: palette.secondary }]} accessibilityLanguage="ar" numberOfLines={1} maxFontSizeMultiplier={1.3}>
                {results.query}
              </Text>
            ) : null}
            {heading ? (
              <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={1.4} testID="search-count">
                {heading}
              </Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <Text style={[typeV2.body, styles.empty, { color: palette.secondary }]} testID="search-none">
            {`Nothing found for “${results.query}”.`}
          </Text>
        }
        renderItem={({ item }) =>
          item.kind === 'target' ? (
            <TargetRow target={item.target} onPress={() => openTarget(item.target)} />
          ) : words ? (
            <SearchVerseCard
              hit={item.hit}
              matched={item.matched}
              words={words}
              translationId={user?.translationId}
              onOpen={() => open(pageOfVerse(item.hit), { sura: item.hit.sura, ayah: item.hit.ayah, last: item.hit.last })}
              onShare={() => shareHit(item.hit)}
              onCopy={() => copyHit(item.hit)}
            />
          ) : null
        }
        testID="search-results"
      />
    );
  } else {
    body = (
      <FlatList
        data={recent}
        keyExtractor={(q) => q}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          recent.length > 0 ? (
            <View style={styles.recentHead}>
              <Text style={[typeV2.name, { color: palette.text }]} accessibilityRole="header" maxFontSizeMultiplier={1.4}>
                Recent
              </Text>
              <Tap
                onPress={() => {
                  if (uid) clearRecentSearches(uid);
                  setRecent([]);
                }}
                hitSlop={10}
                accessibilityRole="button"
                testID="search-recent-clear"
              >
                <Text style={[typeV2.meta, { color: palette.link }]} maxFontSizeMultiplier={1.4}>
                  Clear
                </Text>
              </Tap>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <Tap
            onPress={() => {
              setText(item);
              run(item, words);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Search again: ${item}`}
            style={[styles.row, { borderBottomColor: palette.separator }]}
            testID="search-recent"
          >
            <Mark size="nested" icon="time-outline" />
            <Text style={[hasArabic(item) ? arabicV2(18) : typeV2.body, styles.main, { color: palette.text }]} numberOfLines={1}>
              {item}
            </Text>
          </Tap>
        )}
        testID="search-recent-list"
      />
    );
  }

  return (
    // The top inset from the app's provider, right from the first frame (CLAUDE.md, ScreenSafeAreaView): the native
    // safe-area view applied it a beat after the screen slid in, and the header sat on the status bar meanwhile (an SE
    // at the largest text, Nov 16 2026). The bottom is the bar's own.
    <View style={[styles.container, { backgroundColor: palette.bg, paddingTop: insets.top }]}>
      {header}
      {/* The keyboard pushes the field and the mic up with it, on Android too (edge to edge: the window isn't resized). */}
      <KeyboardAvoidingView style={styles.fill} behavior="padding">
        {status ? (
          <Text style={[typeV2.meta, styles.status, { color: palette.red }]} testID="search-status">
            {status}
          </Text>
        ) : null}
        <View style={styles.fill}>{body}</View>
        {bar}
      </KeyboardAvoidingView>
      <UndoToast
        visible={note != null}
        message={note ?? ''}
        duration={1500}
        onDismiss={() => setNote(null)}
        bottomInset={insets.bottom + BAR_HEIGHT}
      />
      <SpeechModelSheet
        visible={modelSheet}
        onClose={() => setModelSheet(false)}
        onReady={() => {
          setModelSheet(false);
          void voice.listen();
        }}
        title="Search by voice"
        intro="Recite a few words and Revisely finds the ayah."
      />
    </View>
  );
}

function TargetRow({ target, onPress }: { target: SearchTarget; onPress: () => void }) {
  const { palette } = useTheme();
  const { title, meta, icon } = targetText(target);
  return (
    <Tap
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[title, meta].filter(Boolean).join(', ')}
      style={[styles.row, { borderBottomColor: palette.separator }]}
      testID={`search-target-${target.kind}`}
    >
      <Mark size="reply" icon={icon} />
      <View style={styles.main}>
        <Text style={[typeV2.name, { color: palette.text }]} numberOfLines={1}>
          {title}
        </Text>
        {meta ? <Text style={[typeV2.meta, { color: palette.secondary }]}>{meta}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={palette.secondary} />
    </Tap>
  );
}

/** The bottom bar's height above the safe area (the toast sits above it). */
const BAR_HEIGHT = 76;
const MIC = 56;

const styles = StyleSheet.create({
  container: { flex: 1 },
  fill: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: layoutV2.gutter,
    paddingTop: 6,
    paddingBottom: 8,
  },
  headerTitle: { flex: 1, textAlign: 'center' },
  headerSide: { width: 26 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: layoutV2.gutter,
    paddingTop: 10,
    borderTopWidth: layoutV2.hairline,
  },
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    paddingHorizontal: 14,
    minHeight: 48,
  },
  input: { flex: 1, paddingVertical: 10 },
  mic: { width: MIC, height: MIC, borderRadius: MIC / 2, alignItems: 'center', justifyContent: 'center' },
  stopSquare: { width: 18, height: 18, borderRadius: 4 },
  status: { paddingHorizontal: layoutV2.gutter, paddingTop: 10 },
  listening: { flex: 1, paddingHorizontal: layoutV2.gutter, paddingTop: 20, gap: 18 },
  transcriptBox: { flex: 1 },
  wave: { height: 56, justifyContent: 'center', marginBottom: 8 },
  list: { paddingBottom: 24 },
  resultsHead: { paddingHorizontal: layoutV2.gutter, paddingTop: 12, paddingBottom: 4, gap: 6 },
  empty: { paddingHorizontal: layoutV2.gutter, paddingTop: 24 },
  recentHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layoutV2.gutter,
    paddingTop: layoutV2.rowPad + 4,
    paddingBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: layoutV2.markGap,
    minHeight: 56,
    paddingVertical: 10,
    paddingHorizontal: layoutV2.gutter,
    borderBottomWidth: layoutV2.hairline,
  },
  main: { flex: 1, minWidth: 0 },
  arabic: { textAlign: 'right', writingDirection: 'rtl' },
});
