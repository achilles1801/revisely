// Revo's "Add to chat" (mocks a1–a7, approved by Majd on Nov 7 2026): one sheet for everything +
// attaches. A search that reads names as people say them (lib/revo/addSearch); Surahs (mushaf
// order, Majd's choice), Juz, Days (a month, Activity's look) and Pages (a juz's pages as a grid);
// several at once, shown as chips under the search, Add saying how many. Every row has a line of
// the user's own data (lib/revo/facts), the same figures the attachment sends.

import React, { useMemo, useRef, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { describePassage, pagesNote, plainText } from '../../lib/passages';
import { getAllSurahs, getJuzForPage } from '../../lib/quranData';
import { juzPages, surahPages } from '../../lib/revo/attachments';
import { searchAdd, type AddFound } from '../../lib/revo/addSearch';
import { buildAttachments, dayName, isChosen, keyId, keyOf, toggleKey, type AddKey } from '../../lib/revo/addSelection';
import { dayFacts, dayPreview, passageFacts, passagePreview, prepare, type Prepared } from '../../lib/revo/facts';
import { REVO_MAX_ATTACHMENTS, type RevoAttachment, type RevoPassageFacts } from '../../lib/revo/types';
import { useDayExtras } from '../../lib/revo/useDayExtras';
import { useRevoContext } from '../../lib/revo/useRevoContext';
import { juzOf } from '../../lib/revo/words';
import { arabicV2, typeV2 } from '../../theme/v2';
import { RevisedMark } from '../activity/BlockMark';
import { Mark } from '../v2/Mark';
import { PillTabs } from '../v2/PillTabs';
import { Tap } from '../v2/Tap';
import { ContextChip } from './RevoParts';
import { RevoMonth, ringOf } from './RevoMonth';
import { RevoPagesGrid } from './RevoPagesGrid';

type Tab = 'surahs' | 'juz' | 'days' | 'pages';
const TABS: { value: Tab; label: string }[] = [
  { value: 'surahs', label: 'Surahs' },
  { value: 'juz', label: 'Juz' },
  { value: 'days', label: 'Days' },
  { value: 'pages', label: 'Pages' },
];
const SURAHS = getAllSurahs();
const JUZ = Array.from({ length: 30 }, (_, i) => i + 1);
const KIND_ICON = { surah: 'surah', juz: 'juz', pages: 'pages', day: 'revisionDay' } as const;

/** The sheet's own facts cache: each surah's or juz's figures once per opening. */
function useFactsCache(prepared: Prepared | null) {
  const cache = useRef(new Map<string, RevoPassageFacts>());
  const owner = useRef<Prepared | null>(null);
  if (owner.current !== prepared) {
    owner.current = prepared;
    cache.current = new Map();
  }
  return (id: string, pages: () => number[]): RevoPassageFacts | null => {
    if (!prepared) return null;
    let f = cache.current.get(id);
    if (!f) {
      f = passageFacts(pages(), prepared);
      cache.current.set(id, f);
    }
    return f;
  };
}

export function RevoAddSheet({ initial, onCancel, onAdd }: { initial: readonly RevoAttachment[]; onCancel: () => void; onAdd: (list: RevoAttachment[]) => void }) {
  const { palette } = useTheme();
  const { day: today, context, sources } = useRevoContext();
  const prepared = useMemo(() => {
    const src = sources();
    return src ? prepare(src) : null;
  }, [sources]);
  const extras = useDayExtras();
  const facts = useFactsCache(prepared);
  const [others, setOthers] = useState(() => initial.filter((a) => keyOf(a) == null));
  const [keys, setKeys] = useState<AddKey[]>(() => initial.map(keyOf).filter((k): k is AddKey => k != null));
  const [tab, setTab] = useState<Tab>('surahs');
  const [q, setQ] = useState('');
  const juzScroll = useRef<ScrollView>(null);
  const juzScrolled = useRef(false);
  // The account's juz row's place: the list scrolls there when the row is laid out, and again when
  // the list or its content is (Android drops a scroll asked for too early: it stayed at Juz 1 in
  // flow 09-revo-attach, Nov 7 2026), until the user scrolls it themselves.
  const juzTarget = useRef<number | null>(null);
  const scrollToJuz = () => {
    const y = juzTarget.current;
    if (juzScrolled.current || y == null) return;
    juzScroll.current?.scrollTo({ y, animated: false });
    requestAnimationFrame(() => {
      if (!juzScrolled.current) juzScroll.current?.scrollTo({ y, animated: false });
    });
  };
  const room = REVO_MAX_ATTACHMENTS - others.length;
  const count = keys.length + others.length;
  const canAdd = keys.length < room;
  const days = new Set(keys.flatMap((k) => (k.kind === 'day' ? [k.day] : [])));
  const waitingForDays = days.size > 0 && extras == null;
  const addEnabled = (count > 0 || initial.length > 0) && !waitingForDays && prepared != null;
  const toggle = (key: AddKey) => setKeys((ks) => toggleKey(ks, key, room));
  const results = useMemo(() => searchAdd(q, today), [q, today]);

  const notesOn = (day: string) => (prepared && extras ? (dayFacts(day, prepared, extras).notes?.length ?? 0) : 0);
  const chipLabel = (k: AddKey) => {
    if (k.kind !== 'day') return k.label;
    const n = notesOn(k.day);
    return `${dayName(k.day, today)}${n ? ` · ${n} ${n === 1 ? 'note' : 'notes'}` : ''}`;
  };

  const surahRow = (n: number, last: boolean) => {
    const s = SURAHS[n - 1];
    const f = facts(`surah:${n}`, () => surahPages(n));
    const key: AddKey = { kind: 'surah', surah: n, label: plainText(s.name) };
    return (
      <AddRow
        key={keyId(key)}
        mark={<Mark label={String(n)} />}
        name={plainText(s.name)}
        arabic={s.nameArabic}
        line={`${plainText(juzOf(surahPages(n)))} · ${f ? passagePreview(f) : ''}`}
        dim={f?.memorized === 0}
        on={isChosen(keys, key)}
        disabled={!canAdd}
        last={last}
        onPress={() => toggle(key)}
        testID={`revo-add-surah-${n}`}
      />
    );
  };
  const juzRow = (n: number, last: boolean) => {
    const f = facts(`juz:${n}`, () => juzPages(n));
    const key: AddKey = { kind: 'juz', juz: n, label: `Juz ${n}` };
    return (
      <AddRow
        key={keyId(key)}
        mark={<Mark label={String(n)} />}
        name={`Juz ${n}`}
        line={`${plainText(describePassage(juzPages(n), { form: 'short', wholeJuz: false }))} · ${f ? passagePreview(f) : ''}`}
        dim={f?.memorized === 0}
        on={isChosen(keys, key)}
        disabled={!canAdd}
        last={last}
        onPress={() => toggle(key)}
        testID={`revo-add-juz-${n}`}
      />
    );
  };
  const resultRow = (r: AddFound, i: number, last: boolean) => {
    if (r.kind === 'surah') return surahRow(r.surah, last);
    if (r.kind === 'juz') return juzRow(r.juz, last);
    if (r.kind === 'pages') {
      const f = facts(`pages:${r.pages.join(',')}`, () => r.pages);
      const key: AddKey = { kind: 'pages', pages: r.pages, label: r.label };
      return (
        <AddRow
          key={`r-${i}`}
          mark={<Mark icon="document-text-outline" />}
          name={r.label}
          line={[plainText(pagesNote(r.pages)), plainText(juzOf(r.pages)), f ? passagePreview(f) : ''].filter(Boolean).join(' · ')}
          on={isChosen(keys, key)}
          disabled={!canAdd}
          last={last}
          onPress={() => toggle(key)}
          testID={`revo-add-result-${i}`}
        />
      );
    }
    const f = prepared ? dayFacts(r.day, prepared, extras ?? {}) : null;
    const ring = f ? ringOf(f) : null;
    const key: AddKey = { kind: 'day', day: r.day };
    return (
      <AddRow
        key={`r-${i}`}
        mark={<RevisedMark fraction={ring ?? 0} done={(ring ?? 0) >= 1} size={40} />}
        name={dayName(r.day, today)}
        line={f ? dayPreview(f) : ''}
        on={isChosen(keys, key)}
        disabled={!canAdd}
        last={last}
        onPress={() => toggle(key)}
        testID={`revo-add-result-${i}`}
      />
    );
  };

  const GROUP: Record<AddFound['kind'], string> = { surah: 'Surah', juz: 'Juz', pages: 'Pages', day: 'Days' };
  const groupOf = (r: AddFound) => (r.kind === 'pages' && r.ayahs ? 'Ayahs' : r.kind === 'surah' && results.filter((x) => x.kind === 'surah').length > 1 ? 'Surahs' : GROUP[r.kind]);
  const initialJuz = getJuzForPage(context?.today.nextPages[0] ?? prepared?.src.pages.find((p) => p.status === 'memorized')?.pageNumber ?? 1);

  return (
    <View style={styles.fill} testID="revo-add-sheet">
      <View style={styles.head}>
        <Tap onPress={onCancel} accessibilityRole="button" accessibilityLabel="Cancel" style={styles.side} testID="revo-add-cancel">
          <Text style={[typeV2.menu, { color: palette.text }]} maxFontSizeMultiplier={1.4}>
            Cancel
          </Text>
        </Tap>
        <Text style={[typeV2.sheetTitle, styles.title, { color: palette.text }]} maxFontSizeMultiplier={1.4}>
          Add to chat
        </Text>
        <Tap
          onPress={() => prepared && onAdd([...others, ...buildAttachments(keys, prepared, extras ?? {})])}
          disabled={!addEnabled}
          accessibilityRole="button"
          accessibilityLabel={count ? `Add ${count}` : 'Add'}
          accessibilityState={{ disabled: !addEnabled }}
          style={[styles.side, styles.right]}
          testID="revo-add-done"
        >
          <Text style={[typeV2.button, styles.addText, { color: addEnabled && count ? palette.link : palette.secondary }]} maxFontSizeMultiplier={1.4}>
            {count ? `Add ${count}` : 'Add'}
          </Text>
        </Tap>
      </View>

      <View style={[styles.search, { backgroundColor: palette.bubble }]}>
        <Ionicons name="search" size={17} color={palette.secondary} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Surah, juz, day or page"
          placeholderTextColor={palette.secondary}
          style={[styles.searchInput, { color: palette.text }]}
          returnKeyType="search"
          autoCorrect={false}
          accessibilityLabel="Search a surah, juz, day or page"
          testID="revo-add-search"
        />
        {q ? (
          <Tap onPress={() => setQ('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear the search" testID="revo-add-search-clear">
            <Ionicons name="close-circle" size={17} color={palette.secondary} />
          </Tap>
        ) : null}
      </View>

      {count > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
          {others.map((a, i) => (
            <ContextChip key={`o-${i}`} label={a.label} kind={a.kind} onRemove={() => setOthers((os) => os.filter((_, j) => j !== i))} />
          ))}
          {keys.map((k) => (
            <ContextChip key={keyId(k)} label={chipLabel(k)} kind={KIND_ICON[k.kind]} onRemove={() => toggle(k)} />
          ))}
        </ScrollView>
      ) : null}

      {q.trim() ? (
        <ScrollView style={styles.fill} contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" testID="revo-add-results">
          {results.length === 0 ? (
            <Text style={[typeV2.body, styles.empty, { color: palette.secondary }]} testID="revo-add-empty">
              Nothing found. Try a surah, “Juz 14”, “Tuesday” or “p. 288”.
            </Text>
          ) : null}
          {results.map((r, i) => (
            <React.Fragment key={`g-${i}`}>
              {i === 0 || groupOf(results[i - 1]) !== groupOf(r) ? (
                <Text style={[typeV2.meta, styles.group, { color: palette.secondary }]} maxFontSizeMultiplier={1.4}>
                  {groupOf(r)}
                </Text>
              ) : null}
              {resultRow(r, i, i === results.length - 1 || groupOf(results[i + 1]) !== groupOf(r))}
            </React.Fragment>
          ))}
        </ScrollView>
      ) : (
        <>
          <View style={styles.tabs}>
            <PillTabs<Tab>
              options={TABS}
              value={tab}
              onChange={(t) => {
                juzScrolled.current = false;
                juzTarget.current = null;
                setTab(t);
              }}
              tone="ink"
              hug
              testID="revo-add-tabs"
            />
          </View>
          {tab === 'surahs' ? (
            <FlatList
              style={styles.fill}
              contentContainerStyle={styles.list}
              data={SURAHS.map((s) => s.number)}
              keyExtractor={(n) => String(n)}
              renderItem={({ item, index }) => surahRow(item, index === SURAHS.length - 1)}
              initialNumToRender={10}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              testID="revo-add-surahs"
            />
          ) : tab === 'juz' ? (
            // Opens on the account's own juz (today's), a few rows above it in view (mock a5).
            <ScrollView
              ref={juzScroll}
              style={styles.fill}
              contentContainerStyle={styles.list}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              onLayout={scrollToJuz}
              onContentSizeChange={scrollToJuz}
              onScrollBeginDrag={() => {
                juzScrolled.current = true;
              }}
              testID="revo-add-juzlist"
            >
              {JUZ.map((n) => (
                <View
                  key={n}
                  onLayout={
                    n === Math.max(1, initialJuz - 3)
                      ? (e) => {
                          juzTarget.current = e.nativeEvent.layout.y;
                          scrollToJuz();
                        }
                      : undefined
                  }
                >
                  {juzRow(n, n === 30)}
                </View>
              ))}
            </ScrollView>
          ) : prepared ? (
            <ScrollView style={styles.fill} contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
              {tab === 'days' ? (
                <RevoMonth prepared={prepared} extras={extras} today={today} chosen={days} canAdd={canAdd} onToggle={(d) => toggle({ kind: 'day', day: d })} />
              ) : (
                <RevoPagesGrid prepared={prepared} initialJuz={initialJuz} isChosen={(k) => isChosen(keys, k)} canAdd={canAdd} onAdd={toggle} />
              )}
            </ScrollView>
          ) : null}
        </>
      )}
    </View>
  );
}

/** A row: the mark, the name (and the surah's Arabic), a line of the user's data, the check. */
function AddRow({
  mark,
  name,
  arabic,
  line,
  on,
  dim,
  disabled,
  last,
  onPress,
  testID,
}: {
  mark: React.ReactNode;
  name: string;
  arabic?: string;
  line: string;
  on: boolean;
  dim?: boolean;
  disabled?: boolean;
  last?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const { palette } = useTheme();
  const off = disabled && !on;
  return (
    <Tap
      onPress={onPress}
      disabled={off}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on, disabled: off }}
      accessibilityLabel={`${name}. ${line}`}
      testID={testID}
    >
      <View style={styles.row}>
        {mark}
        <View style={styles.rowText}>
          <View style={styles.nameLine}>
            <Text style={[typeV2.name, { color: dim ? palette.secondary : palette.text, flexShrink: 1 }]} numberOfLines={1}>
              {name}
            </Text>
            {arabic ? <Text style={[arabicV2(16), { color: palette.secondary }]} numberOfLines={1}>{`⁨${arabic}⁩`}</Text> : null}
          </View>
          <Text style={[typeV2.meta, { color: palette.secondary }]}>{line}</Text>
        </View>
        {on ? (
          <View style={[styles.check, { backgroundColor: palette.primary }]} testID={testID ? `${testID}-on` : undefined}>
            <Ionicons name="checkmark" size={15} color={palette.onPrimary} />
          </View>
        ) : (
          <View style={[styles.check, styles.ring, { borderColor: palette.outline, opacity: off ? 0.45 : 1 }]} />
        )}
      </View>
      {last ? null : <View style={[styles.sep, { backgroundColor: palette.separator }]} />}
    </Tap>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  head: { height: 44, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  side: { width: 72, height: 44, justifyContent: 'center' },
  right: { alignItems: 'flex-end' },
  title: { flex: 1, textAlign: 'center' },
  addText: { fontSize: 16 },
  search: { height: 40, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, marginHorizontal: 16, marginTop: 8 },
  searchInput: { flex: 1, fontSize: 16, paddingVertical: 0 },
  chipsScroll: { flexGrow: 0, marginTop: 10 },
  chips: { paddingHorizontal: 16, gap: 8 },
  tabs: { paddingHorizontal: 16, marginTop: 12 },
  list: { paddingHorizontal: 16, paddingBottom: 24, paddingTop: 6 },
  group: { fontWeight: '600', marginTop: 14 },
  empty: { marginTop: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  rowText: { flex: 1, minWidth: 0 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  check: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  ring: { borderWidth: 1.5 },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 52 },
});
