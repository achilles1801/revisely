// The Memorized add sheet (Activity d7): pages the user has memorized, for today. Adding marks
// the pages memorized (the same two writes the composer makes) and records a Memorized item for
// the day. "From your reading" offers the pages read today that are not memorized yet.

import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Sheet } from '../v2/Sheet';
import { Tap } from '../v2/Tap';
import { RangePickerSheet } from '../memorization/RangePickerSheet';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { queueChange } from '../../lib/offline/queue';
import { memorizeSuggestion } from '../../lib/activityAdd';
import { parsePageRange } from '../../lib/memorizationLog';
import { describePageRuns, pageRuns } from '../../lib/pageRanges';
import * as firestoreService from '../../services/firestoreService';
import { typeV2 } from '../../theme/v2';
import type { UserPage } from '../../types';

export function AddMemorizedSheet({ visible, onClose, day }: { visible: boolean; onClose: () => void; day: string }) {
  const { user, pages, updatePages } = useApp();
  const { palette } = useTheme();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [tab, setTab] = useState<'pages' | 'surah'>('pages');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [readToday, setReadToday] = useState<number[]>([]);
  const [usedReading, setUsedReading] = useState(false);
  const [saving, setSaving] = useState(false);

  // The pages read today (timed sessions), offered when they are not memorized yet.
  useEffect(() => {
    let cancelled = false;
    firestoreService
      .getReadingSessionsForDay(day)
      .then((list) => !cancelled && setReadToday(list.flatMap((r) => r.pages)))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [day]);

  const memorized = useMemo(() => new Set((pages ?? []).filter((p) => p.status === 'memorized').map((p) => p.pageNumber)), [pages]);
  const suggestion = memorizeSuggestion(readToday, memorized);
  const pageNumbers = parsePageRange(from, to) ?? [];
  const range = parsePageRange(from, to);
  const canAdd = range != null && !saving && !!user;

  const useReading = () => {
    if (suggestion.length === 0) return;
    if (usedReading) {
      setFrom('');
      setTo('');
      setUsedReading(false);
      return;
    }
    setFrom(String(suggestion[0]));
    setTo(String(suggestion[suggestion.length - 1]));
    setUsedReading(true);
  };

  const handleAdd = async () => {
    if (!range || !user) return;
    setSaving(true);
    try {
      const changed = pageNumbers.filter((p) => !memorized.has(p));
      if (changed.length > 0) {
        const inRange = new Set(pageNumbers);
        await updatePages(
          (pages ?? []).map((p: UserPage) =>
            inRange.has(p.pageNumber) && p.status !== 'memorized'
              ? { ...p, status: 'memorized' as const, dateMemorized: new Date().toISOString() }
              : p,
          ),
          changed,
        );
      }
      await queueChange({ kind: 'memorization.mark', day, pages: pageNumbers, at: Date.now() });
      setFrom('');
      setTo('');
      setUsedReading(false);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const fieldStyle = [styles.field, { backgroundColor: palette.fill }];

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Memorized"
      left={{ label: 'Cancel', onPress: onClose }}
      right={{ label: saving ? 'Saving…' : 'Add', onPress: handleAdd, strong: true, disabled: !canAdd }}
      keyboard
      testID="add-memorized-sheet"
    >
      <View style={styles.body}>
        {suggestion.length > 0 && (
          <View style={[styles.banner, { backgroundColor: palette.fill }]}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[typeV2.meta, { color: palette.primary, fontWeight: '700' }]}>From your reading</Text>
              <Text style={[typeV2.body, { color: palette.text }]}>{describePageRuns(pageRuns(suggestion))} · read today</Text>
            </View>
            <Tap onPress={useReading} accessibilityRole="button" accessibilityLabel={usedReading ? 'Undo the reading pages' : 'Use the reading pages'} style={[styles.useBtn, { backgroundColor: palette.primary }]}>
              <Text style={[typeV2.body, { color: palette.onPrimary, fontWeight: '700' }]}>{usedReading ? 'Undo' : 'Use'}</Text>
            </Tap>
          </View>
        )}

        <Text style={[styles.label, { color: palette.secondary }]}>WHAT</Text>
        <View style={[styles.segment, { backgroundColor: palette.fill }]}>
          {(['pages', 'surah'] as const).map((t) => {
            const on = tab === t;
            return (
              <Tap
                key={t}
                testID={`add-memorized-tab-${t}`}
                onPress={() => {
                  setTab(t);
                  if (t === 'surah') setPickerOpen(true);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={[styles.segBtn, on && { backgroundColor: palette.bg ?? palette.text, shadowOpacity: 0 }]}
              >
                <Text style={[typeV2.body, { color: on ? palette.text : palette.secondary, fontWeight: '600' }]}>{t === 'pages' ? 'Pages' : 'Surah'}</Text>
              </Tap>
            );
          })}
        </View>

        <View style={styles.pair}>
          <View style={[...fieldStyle, styles.pageField]}>
            <Text style={[typeV2.meta, { color: palette.secondary }]}>p.</Text>
            <TextInput
              testID="add-memorized-from"
              value={from}
              placeholder="From"
              placeholderTextColor={palette.secondary}
              onChangeText={(v) => {
                setUsedReading(false);
                setFrom(v.replace(/[^0-9]/g, ''));
              }}
              keyboardType="number-pad"
              accessibilityLabel="From page"
              style={[typeV2.body, styles.input, { color: palette.text }]}
            />
          </View>
          <Text style={[typeV2.body, { color: palette.secondary }]}>to</Text>
          <View style={[...fieldStyle, styles.pageField]}>
            <Text style={[typeV2.meta, { color: palette.secondary }]}>p.</Text>
            <TextInput
              testID="add-memorized-to"
              value={to}
              placeholder="To"
              placeholderTextColor={palette.secondary}
              onChangeText={(v) => {
                setUsedReading(false);
                setTo(v.replace(/[^0-9]/g, ''));
              }}
              keyboardType="number-pad"
              accessibilityLabel="To page"
              style={[typeV2.body, styles.input, { color: palette.text }]}
            />
          </View>
        </View>
        <Text style={[typeV2.meta, { color: palette.secondary }]}>
          {range ? `${pageNumbers.length} ${pageNumbers.length === 1 ? 'page' : 'pages'}` : 'Enter the first and last page you memorized'}
        </Text>

        <Text style={[typeV2.meta, { color: palette.secondary, marginTop: 8 }]}>
          Adding marks these pages memorized, so they join your revision plan. For anything else, add a note.
        </Text>
      </View>

      <RangePickerSheet
        visible={pickerOpen}
        onClose={() => {
          setPickerOpen(false);
          setTab('pages');
        }}
        onUse={(r) => {
          setFrom(String(r.from));
          setTo(String(r.to));
          setUsedReading(false);
        }}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: 10, paddingVertical: 8 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 },
  useBtn: { borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
  label: { fontSize: 12, fontWeight: '600', letterSpacing: 0.4, marginTop: 6 },
  segment: { flexDirection: 'row', borderRadius: 999, padding: 3 },
  segBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 999, minHeight: 38 },
  pair: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 14, paddingHorizontal: 14, minHeight: 48 },
  pageField: { flex: 1 },
  input: { flex: 1, padding: 0 },
});
