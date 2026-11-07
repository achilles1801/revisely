import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { shiftDay } from '../../lib/journal';
import { listRecordings, type RecordingMeta } from '../../lib/recordings';
import { logger } from '../../lib/logger';
import * as firestoreService from '../../services/firestoreService';
import { withPendingJournal, withPendingReadings } from '../../lib/offline/queue';
import { attachmentFor, dayAttachment, dayLabel, findPassages, pagesAttachment, recordingAttachment, type Found } from '../../lib/revo/attachments';
import { dayPreview, passagePreview, prepare, type DayExtras } from '../../lib/revo/facts';
import { passageShort } from '../../lib/revo/words';
import type { RevoAttachment } from '../../lib/revo/types';
import { useRevoContext } from '../../lib/revo/useRevoContext';
import type { JournalEntry, ReadingSession } from '../../types';
import { Tap } from '../v2/Tap';
import type { PickKind } from './RevoComposer';
import { RevoSubHeader } from './RevoParts';

const TITLES: Record<PickKind, string> = { day: 'A day', page: 'A surah, juz or page', recording: 'A recording' };
const DAYS_BACK = 14;

interface Choice {
  key: string;
  title: string;
  line: string;
  make: () => RevoAttachment;
}

/** What a day's facts read beyond the logs: loaded when the day list opens; null until then, or when one fails. */
function useDayExtras(enabled: boolean): DayExtras | null {
  const [extras, setExtras] = useState<DayExtras | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    Promise.allSettled([
      firestoreService.getJournalEntries(60).then((list) => withPendingJournal(list)),
      firestoreService.getReadingSessions().then((list) => withPendingReadings(list)),
      listRecordings(),
    ]).then(([j, r, rec]) => {
      if (!live) return;
      if (j.status === 'rejected') logger.warn('Revo: daily log not loaded', j.reason);
      if (r.status === 'rejected') logger.warn('Revo: readings not loaded', r.reason);
      setExtras({
        journal: j.status === 'fulfilled' ? (j.value as JournalEntry[]) : null,
        readings: r.status === 'fulfilled' ? (r.value as ReadingSession[]) : null,
        recordings: rec.status === 'fulfilled' ? (rec.value as RecordingMeta[]) : null,
      });
    });
    return () => {
      live = false;
    };
  }, [enabled]);
  return extras;
}

/** Picking what to add to a question: a list, with search for surahs, juz and pages. */
export function RevoPicker({ kind, onBack, onPick }: { kind: PickKind; onBack: () => void; onPick: (a: RevoAttachment) => void }) {
  const { palette } = useTheme();
  const { day: today, context, sources } = useRevoContext();
  const yesterday = shiftDay(today, -1);
  const [q, setQ] = useState('');
  const [recordings, setRecordings] = useState<RecordingMeta[] | null>(null);
  const extras = useDayExtras(kind === 'day');
  // The account's data read once for every row (the credits indexed, the plan's days cached).
  const prepared = useMemo(() => {
    const src = sources();
    return src ? prepare(src) : null;
  }, [sources]);

  useEffect(() => {
    if (kind === 'recording') {
      listRecordings()
        .then((list) => setRecordings([...list].sort((a, b) => b.createdAt - a.createdAt).slice(0, 40)))
        .catch(() => setRecordings([]));
    }
  }, [kind]);

  const choices = useMemo((): Choice[] | null => {
    if (!prepared) return null;
    if (kind === 'day') {
      if (!extras) return null;
      return Array.from({ length: DAYS_BACK }, (_, i) => {
        const d = shiftDay(today, -i);
        const label = dayLabel(d, today, yesterday);
        const a = dayAttachment(d, label, prepared, extras);
        return { key: d, title: label, line: a.kind === 'revisionDay' ? dayPreview(a.facts) : '', make: () => a };
      });
    }
    if (kind === 'page') {
      const found: Found[] = q.trim()
        ? findPassages(q)
        : [
            ...(context && context.today.nextPages.length ? [{ kind: 'pages' as const, pages: context.today.nextPages.slice(0, 2), label: passageShort(context.today.nextPages.slice(0, 2)) }] : []),
            ...(context && context.weakPages.length ? [{ kind: 'pages' as const, pages: context.weakPages.slice(0, 4), label: passageShort(context.weakPages.slice(0, 4)) }] : []),
          ];
      return found.map((f, i) => {
        const a = f.kind === 'pages' ? pagesAttachment(f.pages, prepared, f.label) : attachmentFor(f, prepared);
        const facts = a.kind === 'surah' || a.kind === 'juz' || a.kind === 'pages' ? a.facts : null;
        const lead = !q.trim() ? (i === 0 && context?.today.nextPages.length ? 'Coming up today' : 'Rated weak') : null;
        const line = [lead, facts ? passagePreview(facts) : null].filter(Boolean).join(' · ');
        return { key: `${f.kind}-${f.label}`, title: a.label, line, make: () => a };
      });
    }
    if (!recordings) return null;
    return recordings.map((r) => {
      const a = recordingAttachment(r);
      const minutes = Math.max(1, Math.round(r.durationMs / 60000));
      const pagesOf = a.kind === 'recording' ? a.pages : [];
      return { key: r.id, title: a.label, line: `${minutes} min${pagesOf.length ? ` · ${passageShort(pagesOf)}` : ''}`, make: () => a };
    });
  }, [kind, today, yesterday, prepared, extras, q, context, recordings]);

  return (
    <View style={styles.fill} testID={`revo-pick-${kind}`}>
      <View style={styles.gutter}>
        <RevoSubHeader title={TITLES[kind]} onBack={onBack} />
        {kind === 'page' ? (
          <View style={[styles.search, { backgroundColor: palette.bubble }]}>
            <Ionicons name="search" size={20} color={palette.secondary} />
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="A surah, a juz or a page"
              placeholderTextColor={palette.secondary}
              style={[styles.searchInput, { color: palette.text }]}
              autoFocus
              returnKeyType="search"
              accessibilityLabel="A surah, a juz or a page"
              testID="revo-pick-search"
            />
          </View>
        ) : null}
        {kind === 'day' || kind === 'recording' ? (
          <Text style={[styles.hint, { color: palette.secondary }]}>
            {kind === 'day' ? 'A day goes with its notes, when it has any.' : 'Only its length and pages are sent, never the audio.'}
          </Text>
        ) : null}
      </View>
      <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
        {choices == null ? <ActivityIndicator style={styles.loading} color={palette.secondary} /> : null}
        {choices != null && choices.length === 0 ? (
          <Text style={[styles.hint, { color: palette.secondary }]} testID="revo-pick-empty">
            {kind === 'recording' ? 'No recordings on this phone.' : 'Nothing found.'}
          </Text>
        ) : null}
        {(choices ?? []).map((c, i) => (
          <Tap
            key={c.key}
            onPress={() => onPick(c.make())}
            style={[styles.row, i > 0 && { borderTopColor: palette.separator, borderTopWidth: StyleSheet.hairlineWidth }]}
            accessibilityRole="button"
            accessibilityLabel={`${c.title}, ${c.line}`}
            testID={`revo-pick-${kind}-${i}`}
          >
            <View style={styles.rowText}>
              <Text style={[styles.rowTitle, { color: palette.text }]} numberOfLines={2}>
                {c.title}
              </Text>
              <Text style={[styles.rowLine, { color: palette.secondary }]}>{c.line}</Text>
            </View>
            <Ionicons name="add-circle-outline" size={22} color={palette.secondary} />
          </Tap>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  gutter: { paddingHorizontal: 16 },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  loading: { marginTop: 24 },
  search: { height: 44, borderRadius: 14, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 8, marginTop: 8 },
  searchInput: { flex: 1, fontSize: 17 },
  hint: { fontSize: 14, lineHeight: 19, marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 17, lineHeight: 22 },
  rowLine: { fontSize: 14, lineHeight: 19 },
});
