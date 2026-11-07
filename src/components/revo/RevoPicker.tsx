import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { shiftDay } from '../../lib/journal';
import { listRecordings, type RecordingMeta } from '../../lib/recordings';
import { logger } from '../../lib/logger';
import * as firestoreService from '../../services/firestoreService';
import { withPendingJournal } from '../../lib/offline/queue';
import {
  dayAttachment,
  dayLabel,
  findPagesOrSurahs,
  noteAttachment,
  pageAttachment,
  recordingAttachment,
} from '../../lib/revo/attachments';
import { pagesLabel } from '../../lib/revo/greeting';
import type { RevoAttachment } from '../../lib/revo/types';
import { useRevoContext } from '../../lib/revo/useRevoContext';
import { Tap } from '../v2/Tap';
import type { PickKind } from './RevoComposer';
import { RevoSubHeader } from './RevoParts';

const TITLES: Record<PickKind, string> = { day: 'A day', page: 'A page or surah', note: 'A note', recording: 'A recording' };
const DAYS_BACK = 14;

interface Choice {
  key: string;
  title: string;
  line: string;
  make: () => RevoAttachment;
}

/** Picking what to add to a question: a list, with search for pages and surahs. */
export function RevoPicker({ kind, onBack, onPick }: { kind: PickKind; onBack: () => void; onPick: (a: RevoAttachment) => void }) {
  const { palette } = useTheme();
  const { logs, pages } = useApp();
  const { day: today, context } = useRevoContext();
  const yesterday = shiftDay(today, -1);
  const [q, setQ] = useState('');
  const [notes, setNotes] = useState<{ day: string; at: number; text: string }[] | null>(null);
  const [recordings, setRecordings] = useState<RecordingMeta[] | null>(null);

  useEffect(() => {
    if (kind === 'note') {
      firestoreService
        .getJournalEntries(60)
        .then((list) => withPendingJournal(list))
        .then((entries) =>
          setNotes(
            entries
              .flatMap((e) => e.entries.filter((n) => n.text.trim().length > 0).map((n) => ({ day: e.date, at: n.at, text: n.text })))
              .sort((a, b) => b.at - a.at)
              .slice(0, 40),
          ),
        )
        .catch((err) => {
          logger.warn('Revo: notes not loaded', err);
          setNotes([]);
        });
    }
    if (kind === 'recording') {
      listRecordings()
        .then((list) => setRecordings([...list].sort((a, b) => b.createdAt - a.createdAt).slice(0, 40)))
        .catch(() => setRecordings([]));
    }
  }, [kind]);

  const choices = useMemo((): Choice[] | null => {
    if (kind === 'day') {
      return Array.from({ length: DAYS_BACK }, (_, i) => {
        const d = shiftDay(today, -i);
        const label = dayLabel(d, today, yesterday);
        const n = logs.filter((l) => l.date === d).reduce((sum, l) => sum + l.pagesRevised.length, 0);
        return { key: d, title: label, line: n > 0 ? `${n} ${n === 1 ? 'page' : 'pages'} revised` : 'Nothing revised', make: () => dayAttachment({ day: d, label, logs, pages }) };
      });
    }
    if (kind === 'page') {
      const found = findPagesOrSurahs(q);
      const suggested = q.trim()
        ? []
        : [
            ...(context && context.today.nextPages.length ? [{ label: pagesLabel(context.today.nextPages.slice(0, 2)), pages: context.today.nextPages.slice(0, 2), detail: 'Coming up today' }] : []),
            ...(context && context.weakPages.length ? [{ label: pagesLabel(context.weakPages.slice(0, 4)), pages: context.weakPages.slice(0, 4), detail: 'Rated weak' }] : []),
          ];
      return [...suggested, ...found].map((f) => ({
        key: `${f.label}-${f.pages[0]}`,
        title: f.label,
        line: f.detail,
        make: () => pageAttachment({ pages: f.pages, label: f.label, logs, userPages: pages }),
      }));
    }
    if (kind === 'note') {
      if (!notes) return null;
      return notes.map((n) => ({
        key: `${n.day}-${n.at}`,
        title: n.text.split('\n')[0].slice(0, 80),
        line: dayLabel(n.day, today, yesterday),
        make: () => noteAttachment(n),
      }));
    }
    if (!recordings) return null;
    return recordings.map((r) => {
      const a = recordingAttachment(r);
      const minutes = Math.max(1, Math.round(r.durationMs / 60000));
      const pagesOf = a.kind === 'recording' ? a.pages : [];
      return { key: r.id, title: a.label, line: `${minutes} min${pagesOf.length ? ` · ${pagesLabel(pagesOf)}` : ''}`, make: () => a };
    });
  }, [kind, today, yesterday, logs, pages, q, context, notes, recordings]);

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
              placeholder="A page number or a surah"
              placeholderTextColor={palette.secondary}
              style={[styles.searchInput, { color: palette.text }]}
              autoFocus
              returnKeyType="search"
              accessibilityLabel="A page number or a surah"
              testID="revo-pick-search"
            />
          </View>
        ) : null}
        {kind === 'note' || kind === 'recording' ? (
          <Text style={[styles.hint, { color: palette.secondary }]}>
            {kind === 'note' ? 'Only the note you pick is sent, with this question.' : 'Only its length and pages are sent, never the audio.'}
          </Text>
        ) : null}
      </View>
      <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
        {choices == null ? <ActivityIndicator style={styles.loading} color={palette.secondary} /> : null}
        {choices != null && choices.length === 0 ? (
          <Text style={[styles.hint, { color: palette.secondary }]} testID="revo-pick-empty">
            {kind === 'note' ? 'No notes yet.' : kind === 'recording' ? 'No recordings on this phone.' : 'Nothing found.'}
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
