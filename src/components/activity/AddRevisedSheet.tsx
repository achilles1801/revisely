// The Revised add sheet (Activity d6): pages revised outside a session, for today. A
// strength choice writes each page's weakness rating (the same field a session's ratings write).

import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Sheet } from '../v2/Sheet';
import { Tap } from '../v2/Tap';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { queueChange } from '../../lib/offline/queue';
import { missedFromSession } from '../../lib/activityAdd';
import {
  manualRevisionItem,
  pagesInRange,
  parsePageRange,
  STRENGTH_RATING,
  type Strength,
} from '../../lib/manualRevision';
import { typeV2 } from '../../theme/v2';
import type { WeaknessRating } from '../../types/firestore';

const STRENGTHS: { key: Strength; label: string }[] = [
  { key: 'weak', label: 'Weak' },
  { key: 'moderate', label: 'Moderate' },
  { key: 'strong', label: 'Strong' },
];

export function AddRevisedSheet({ visible, onClose, day, logs }: { visible: boolean; onClose: () => void; day: string; logs: { date: string; pagesRevised: number[]; pagesSkipped: number[] }[] }) {
  const { user, pages, updatePages } = useApp();
  const { palette } = useTheme();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [minutes, setMinutes] = useState('');
  const [strength, setStrength] = useState<Strength | null>(null);
  const [saving, setSaving] = useState(false);

  // "From your session": the pages today's session skipped and that are memorized (the add menu's
  // own suggestion). Using it fills From and To with its first and last page; Undo clears them.
  const memorized = useMemo(() => new Set((pages ?? []).filter((p) => p.status === 'memorized').map((p) => p.pageNumber)), [pages]);
  const todaysLog = logs.find((l) => l.date === day);
  const missed = todaysLog ? missedFromSession(todaysLog, memorized) : [];
  const [usedSession, setUsedSession] = useState(false);

  const range = parsePageRange(from, to);
  const pageNumbers = range ? pagesInRange(range) : [];
  const minutesValue = minutes.trim() === '' ? null : Number(minutes);
  const minutesOk = minutesValue === null || (Number.isInteger(minutesValue) && minutesValue >= 0);
  const canAdd = range != null && minutesOk && !saving && !!user;

  const useSession = () => {
    if (missed.length === 0) return;
    if (usedSession) {
      setFrom('');
      setTo('');
      setUsedSession(false);
      return;
    }
    setFrom(String(missed[0]));
    setTo(String(missed[missed.length - 1]));
    setUsedSession(true);
  };

  const handleAdd = async () => {
    if (!range || !user) return;
    setSaving(true);
    try {
      const item = manualRevisionItem({ uid: user.id, day, now: Date.now(), pages: pageNumbers, minutes: minutesValue });
      await queueChange({ kind: 'revision.add', item });
      if (strength) {
        const rating = STRENGTH_RATING[strength] as WeaknessRating;
        const inRange = new Set(pageNumbers);
        const changed = (pages ?? []).filter((p) => inRange.has(p.pageNumber)).map((p) => ({ ...p, weaknessRating: rating }));
        await updatePages(changed, pageNumbers);
      }
      setFrom('');
      setTo('');
      setMinutes('');
      setStrength(null);
      setUsedSession(false);
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
      title="Revised"
      left={{ label: 'Cancel', onPress: onClose }}
      right={{ label: saving ? 'Saving…' : 'Add', onPress: handleAdd, strong: true, disabled: !canAdd }}
      keyboard
      testID="add-revised-sheet"
    >
      <View style={styles.body}>
        {missed.length > 0 && (
          <Tap onPress={useSession} accessibilityRole="button" accessibilityLabel={usedSession ? 'Undo the session pages' : 'Use the pages the session skipped'} style={[styles.banner, { backgroundColor: palette.fill }]}>
            <Text style={[typeV2.body, { color: palette.primary, flex: 1 }]}>
              <Text style={{ fontWeight: '700' }}>From your session: </Text>
              {`the ${missed.length} ${missed.length === 1 ? 'page' : 'pages'} it skipped`}
            </Text>
            <Text style={[typeV2.body, { color: palette.primary, fontWeight: '600' }]}>{usedSession ? 'Undo' : 'Use'}</Text>
          </Tap>
        )}

        <Text style={[styles.label, { color: palette.secondary }]}>PAGES</Text>
        <View style={styles.pair}>
          <View style={[...fieldStyle, styles.pageField]}>
            <Text style={[typeV2.meta, { color: palette.secondary }]}>p.</Text>
            <TextInput
              testID="add-revised-from"
              value={from}
              onChangeText={(v) => {
                setUsedSession(false);
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
              testID="add-revised-to"
              value={to}
              onChangeText={(v) => {
                setUsedSession(false);
                setTo(v.replace(/[^0-9]/g, ''));
              }}
              keyboardType="number-pad"
              accessibilityLabel="To page"
              style={[typeV2.body, styles.input, { color: palette.text }]}
            />
          </View>
        </View>
        <Text style={[typeV2.meta, { color: palette.secondary }]}>
          {range ? `${pageNumbers.length} ${pageNumbers.length === 1 ? 'page' : 'pages'}` : 'Enter the first and last page you revised'}
        </Text>

        <Text style={[styles.label, { color: palette.secondary }]}>MINUTES</Text>
        <View style={fieldStyle}>
          <TextInput
            testID="add-revised-minutes"
            value={minutes}
            onChangeText={(v) => setMinutes(v.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
            accessibilityLabel="Minutes"
            style={[typeV2.body, styles.input, { color: palette.text }]}
          />
          <Text style={[typeV2.meta, { color: palette.secondary }]}>min</Text>
        </View>

        <Text style={[styles.label, { color: palette.secondary }]}>HOW DID IT GO? (OPTIONAL)</Text>
        <View style={styles.choices}>
          {STRENGTHS.map((s) => {
            const on = strength === s.key;
            return (
              <Tap
                key={s.key}
                testID={`add-revised-strength-${s.key}`}
                onPress={() => setStrength(on ? null : s.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={s.label}
                style={[styles.choice, { backgroundColor: on ? palette.primary : palette.fill }]}
              >
                <Text style={[typeV2.body, { color: on ? palette.onPrimary : palette.text, fontWeight: '600' }]}>{s.label}</Text>
              </Tap>
            );
          })}
        </View>

        <Text style={[typeV2.meta, { color: palette.secondary }]}>
          {range ? `Adds ${pageNumbers.length} ${pageNumbers.length === 1 ? 'page' : 'pages'} to today’s Revised block.` : ' '}
        </Text>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: 10, paddingVertical: 8 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 },
  label: { fontSize: 12, fontWeight: '600', letterSpacing: 0.4, marginTop: 6 },
  pair: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 14, paddingHorizontal: 14, minHeight: 48 },
  pageField: { flex: 1 },
  input: { flex: 1, padding: 0 },
  choices: { flexDirection: 'row', gap: 8 },
  choice: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 999, minHeight: 44 },
});
