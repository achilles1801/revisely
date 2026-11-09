import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, StyleSheet, Text, TextInput, View } from 'react-native';
import { FlatList } from 'react-native-gesture-handler';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { TopSafeAreaView } from '../../components/SafeAreaView';
import { Mark } from '../../components/v2/Mark';
import { Tap } from '../../components/v2/Tap';
import { SpeechModelSheet } from '../../components/recite/SpeechModelSheet';
import { useVoiceSearch } from '../../components/search/useVoiceSearch';
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
 * Search the Qur'an (testers): type a surah, an ayah ("2:255", "Yunus 16"), a page or
 * Arabic words, or tap the mic and recite a few words. Results open the reader at the
 * ayah, highlighted. Before anything is typed, the last searches.
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
  const pending = useRef<string | null>(null);

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

  const run = useCallback(
    (query: string, w: QuranWords | null) => {
      const q = query.trim();
      if (!q) {
        setResults(null);
        return;
      }
      if (!w && hasArabic(q)) {
        // Searched before the words have loaded: once they have.
        pending.current = q;
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
    },
    [uid],
  );

  useEffect(() => {
    if (words && pending.current) {
      const q = pending.current;
      pending.current = null;
      run(q, words);
    }
  }, [words, run]);

  const voice = useVoiceSearch((heard) => {
    setText(heard);
    run(heard, words);
  });

  const startListening = useCallback(() => {
    Keyboard.dismiss();
    if (voice.needsModel) {
      setModelSheet(true);
      return;
    }
    void voice.listen();
  }, [voice]);

  // Opened from the mic on the Read tab: listen at once.
  const listenOnOpen = route.params?.listen === true;
  useEffect(() => {
    if (listenOnOpen) startListening();
    else inputRef.current?.focus();
    // Once, on opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const open = useCallback(
    (pageNumber: number, highlight?: { sura: number; ayah: number }) => {
      Keyboard.dismiss();
      navigation.push('QuranReader', { pageNumber, source: 'search', highlight });
    },
    [navigation],
  );

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

  const header = (
    <View style={[styles.bar, { borderBottomColor: palette.separator }]}>
      <Tap onPress={() => navigation.goBack()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back" testID="search-back">
        <Ionicons name="chevron-back" size={26} color={palette.text} />
      </Tap>
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
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={listening ? 'Stop listening' : 'Search by voice'}
          style={[styles.mic, { backgroundColor: listening ? palette.red : palette.primary }]}
          testID="search-mic"
        >
          <Ionicons name={listening ? 'stop' : 'mic'} size={20} color={listening ? palette.onRedFill : palette.onPrimary} />
        </Tap>
      ) : null}
    </View>
  );

  let body: React.ReactNode;
  if (listening || thinking) {
    body = (
      <View style={styles.listening} testID="search-listening">
        <Text style={[typeV2.name, { color: palette.text }]} maxFontSizeMultiplier={1.4}>
          {thinking ? 'Searching…' : voice.status === 'starting' ? 'Getting ready…' : 'Listening…'}
        </Text>
        {voice.partial ? (
          <Text style={[arabicV2(22), styles.arabic, { color: palette.secondary }]} accessibilityLanguage="ar" testID="search-partial">
            {voice.partial}
          </Text>
        ) : thinking ? (
          <ActivityIndicator color={palette.secondary} />
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
          heading ? (
            <Text style={[typeV2.meta, styles.heading, { color: palette.secondary }]} testID="search-count">
              {heading}
            </Text>
          ) : null
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
            <VerseRow
              hit={item.hit}
              matched={item.matched}
              words={words}
              onPress={() => open(pageOfVerse(item.hit), { sura: item.hit.sura, ayah: item.hit.ayah })}
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
              <Text style={[typeV2.name, { color: palette.text }]} accessibilityRole="header">
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
                <Text style={[typeV2.meta, { color: palette.link }]}>Clear</Text>
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
    <TopSafeAreaView style={[styles.container, { backgroundColor: palette.bg }]}>
      {header}
      {status ? (
        <Text style={[typeV2.meta, styles.status, { color: palette.red }]} testID="search-status">
          {status}
        </Text>
      ) : null}
      {body}
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
    </TopSafeAreaView>
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

/** A verse found in the text: where it is, then the ayah with the words found in full ink. */
function VerseRow({ hit, matched, words, onPress }: { hit: VerseHit; matched: Set<number>; words: QuranWords; onPress: () => void }) {
  const { palette } = useTheme();
  const [from, to] = words.verseRange(hit.sura, hit.ayah);
  const indexes = useMemo(() => Array.from({ length: to - from }, (_, k) => from + k), [from, to]);
  const page = pageOfVerse(hit);
  return (
    <Tap
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${verseTitle(hit.sura, hit.ayah)}, page ${page}`}
      style={[styles.verse, { borderBottomColor: palette.separator }]}
      testID={`search-verse-${hit.sura}-${hit.ayah}`}
    >
      <View style={styles.verseHead}>
        <Text style={[typeV2.name, styles.main, { color: palette.text }]} numberOfLines={1}>
          {verseTitle(hit.sura, hit.ayah)}
        </Text>
        <Text style={[typeV2.meta, { color: palette.secondary }]}>{`p.${NBSP}${page}`}</Text>
      </View>
      <Text style={[arabicV2(22), styles.arabic]} accessibilityLanguage="ar">
        {indexes.map((i, k) => (
          <Text key={i} style={{ color: matched.has(i) ? palette.text : palette.secondary }}>
            {k > 0 ? ' ' : ''}
            {words.uthmani(i)}
          </Text>
        ))}
      </Text>
    </Tap>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: layoutV2.gutter,
    paddingTop: 8,
    paddingBottom: 10,
    borderBottomWidth: layoutV2.hairline,
  },
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    paddingHorizontal: 12,
    minHeight: 40,
  },
  input: { flex: 1, paddingVertical: 8 },
  mic: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  status: { paddingHorizontal: layoutV2.gutter, paddingTop: 10 },
  listening: { paddingHorizontal: layoutV2.gutter, paddingTop: 28, gap: 14, alignItems: 'center' },
  list: { paddingBottom: 40 },
  heading: { paddingHorizontal: layoutV2.gutter, paddingTop: 14, paddingBottom: 4 },
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
  verse: {
    paddingVertical: 12,
    paddingHorizontal: layoutV2.gutter,
    borderBottomWidth: layoutV2.hairline,
    gap: 6,
  },
  verseHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  arabic: { textAlign: 'right', writingDirection: 'rtl' },
});
