// The Revised add sheet (Activity d6): pages revised outside a session, for the day. A strength
// choice writes each page's weakness rating (the same field a session's ratings write).
// "From your session" fills in the pages the day's session skipped (ACT-5); the line at the foot
// says what adding does to the day ("Adding these makes today 20 of 20.").

import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Sheet } from '../v2/Sheet';
import { RangePickerSheet } from '../memorization/RangePickerSheet';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { queueChange } from '../../lib/offline/queue';
import { missedFromSession } from '../../lib/activityAdd';
import { manualRevisionItem, pagesInRange, parsePageRange, STRENGTH_RATING, type Strength } from '../../lib/manualRevision';
import { describePassage } from '../../lib/passages';
import { typeV2 } from '../../theme/v2';
import type { WeaknessRating } from '../../types/firestore';
import { RevisedMark } from './BlockMark';
import { FormLabel, InfoLine, DismissArea, MinutesField, PageRangeFields, Segmented, StrengthChoice, SuggestionLine } from './AddSheetParts';

type Log = { date: string; pagesRevised: number[]; pagesSkipped: number[]; assignedPages?: number[] };
type What = 'pages' | 'surah' | 'juz';

const pagesWord = (n: number) => `${n} ${n === 1 ? 'page' : 'pages'}`;

export function AddRevisedSheet({
  visible,
  onClose,
  day,
  dayName = 'today',
  logs,
}: {
  visible: boolean;
  onClose: () => void;
  day: string;
  /** How the sheet names the day: "today", "yesterday", "Sunday". */
  dayName?: string;
  logs: Log[];
}) {
  const { user, pages, updatePages } = useApp();
  const { palette } = useTheme();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [minutes, setMinutes] = useState('');
  const [strength, setStrength] = useState<Strength | null>(null);
  const [what, setWhat] = useState<What>('pages');
  const [picker, setPicker] = useState<'surah' | 'juz' | null>(null);
  const [saving, setSaving] = useState(false);

  // "From your session": the pages the day's session skipped that are memorized (the add menu's own
  // suggestion). Using it fills From and To with its first and last page; Undo clears them.
  const memorized = useMemo(() => new Set((pages ?? []).filter((p) => p.status === 'memorized').map((p) => p.pageNumber)), [pages]);
  const log = logs.find((l) => l.date === day);
  const missed = log ? missedFromSession(log, memorized) : [];
  const assigned = log ? (log.assignedPages && log.assignedPages.length > 0 ? log.assignedPages : [...log.pagesRevised, ...log.pagesSkipped]) : [];
  const done = new Set(log?.pagesRevised ?? []);
  const [usedSession, setUsedSession] = useState(false);

  const range = parsePageRange(from, to);
  const pageNumbers = range ? pagesInRange(range) : [];
  const minutesValue = minutes.trim() === '' ? null : Number(minutes);
  const minutesOk = minutesValue === null || (Number.isInteger(minutesValue) && minutesValue >= 0);
  const canAdd = range != null && minutesOk && !saving && !!user;

  // What adding does to the day: the session's figure once these pages join it (credit follows the
  // pages, ACT-5), or how many it adds when none of them were assigned.
  const assignedSet = new Set(assigned);
  const after = new Set([...done, ...pageNumbers.filter((p) => assignedSet.has(p))]).size;
  const info = !range
    ? null
    : assigned.length > 0 && after > done.size
      ? `Adding ${pageNumbers.length === 1 ? 'it' : 'these'} makes ${dayName} ${after} of ${assigned.length}.`
      : `Adds ${pagesWord(pageNumbers.length)} to ${dayName === 'today' ? 'today’s' : `${dayName}’s`} Revised block.`;

  const clearSession = () => setUsedSession(false);
  const useSession = () => {
    if (missed.length === 0) return;
    if (usedSession) {
      setFrom('');
      setTo('');
      setUsedSession(false);
      return;
    }
    setWhat('pages');
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
      setWhat('pages');
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Revised"
      titleMark={
        <RevisedMark
          fraction={assigned.length > 0 ? done.size / assigned.length : 0}
          done={assigned.length > 0 && done.size >= assigned.length}
          size={24}
        />
      }
      headerRule="full"
      left={{ label: 'Cancel', onPress: onClose }}
      right={{ label: saving ? 'Saving…' : 'Add', onPress: handleAdd, strong: true, accent: true, disabled: !canAdd, testID: 'add-revised-add' }}
      keyboard
      testID="add-revised-sheet"
    >
      <DismissArea>
      <View style={styles.body}>
        {missed.length > 0 && (
          <View style={styles.top}>
            <SuggestionLine
              label="From your session:"
              text={`${describePassage(missed, { form: 'short' })}, which it skipped`}
              action={usedSession ? 'Undo' : 'Use'}
              onPress={useSession}
              accessibilityLabel={usedSession ? 'Undo the session pages' : 'Use the pages the session skipped'}
              testID="add-revised-from-session"
            />
          </View>
        )}

        <FormLabel text="WHAT" />
        <Segmented<What>
          options={[
            { value: 'pages', label: 'Pages' },
            { value: 'surah', label: 'Surah' },
            { value: 'juz', label: 'Juz' },
          ]}
          value={what}
          onChange={(w) => {
            setWhat(w);
            if (w !== 'pages') setPicker(w);
          }}
          testID="add-revised-what"
        />
        <View style={styles.fields}>
          <PageRangeFields
            from={from}
            to={to}
            onFrom={(v) => {
              clearSession();
              setFrom(v);
            }}
            onTo={(v) => {
              clearSession();
              setTo(v);
            }}
            testIDs={{ from: 'add-revised-from', to: 'add-revised-to' }}
          />
        </View>
        {range ? (
          <Text style={[typeV2.meta, styles.under, { color: palette.secondary }]} testID="add-revised-range">
            {`${describePassage(pageNumbers, { form: 'compact' })} · ${pagesWord(pageNumbers.length)}`}
          </Text>
        ) : null}

        <FormLabel text="MINUTES" />
        <MinutesField value={minutes} onChange={setMinutes} testID="add-revised-minutes" />

        <FormLabel text="HOW DID IT GO?" right="Optional" />
        <StrengthChoice value={strength} onChange={setStrength} />

        {info ? <InfoLine text={info} testID="add-revised-info" /> : null}
      </View>
      </DismissArea>

      <RangePickerSheet
        visible={picker != null}
        initialKind={picker ?? 'surah'}
        onClose={() => {
          setPicker(null);
          setWhat('pages');
        }}
        onUse={(r) => {
          clearSession();
          setFrom(String(r.from));
          setTo(String(r.to));
        }}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingBottom: 8 },
  top: { marginTop: 8 },
  fields: { marginTop: 10 },
  under: { marginTop: 8, marginHorizontal: 2 },
});
