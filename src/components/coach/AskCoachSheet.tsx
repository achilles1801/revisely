// The Ask coach sheet (d9): an optional question about one Insight. Off until the account has
// turned it on; the sheet says what is sent before it does. Only the totals of the chosen insight
// go; the server checks them and refuses anything else (C6).

import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Sheet } from '../v2/Sheet';
import { Tap } from '../v2/Tap';
import { PillButton } from '../v2/PillButton';
import { useTheme } from '../../context/ThemeContext';
import { askCoach, setCoachOptIn, type CoachAnswer } from '../../lib/coach/api';
import { COACH_FIELDS, coachTotals, type CoachInsight } from '../../lib/coach/totals';
import { typeV2 } from '../../theme/v2';

const CHOICES: { key: CoachInsight; label: string }[] = [
  { key: 'coverage', label: 'Coverage' },
  { key: 'consistency', label: 'Consistency' },
  { key: 'weakSpots', label: 'Weak spots' },
  { key: 'pace', label: 'Pace' },
];

const WHAT_IS_SENT = (insight: CoachInsight) =>
  `Only the numbers behind ${CHOICES.find((c) => c.key === insight)?.label.toLowerCase()} are sent: ${COACH_FIELDS[insight].join(', ')}. Never your notes, recordings, names or page lists.`;

export function AskCoachSheet({
  visible,
  onClose,
  day,
  totals,
}: {
  visible: boolean;
  onClose: () => void;
  /** The revision day: one answer per insight and day. */
  day: string;
  /** Every total the app can compute, by name (lib/coach/totals). */
  totals: Record<string, number>;
}) {
  const { palette } = useTheme();
  const [optedIn, setOptedIn] = useState(false);
  const [insight, setInsight] = useState<CoachInsight>('coverage');
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<CoachAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);

  const turnOn = async () => {
    setBusy(true);
    setError(null);
    try {
      await setCoachOptIn(true);
      setOptedIn(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The coach is not available on this account.');
    } finally {
      setBusy(false);
    }
  };

  const ask = async () => {
    setBusy(true);
    setError(null);
    setAnswer(null);
    try {
      const result = await askCoach(insight, coachTotals(insight, totals), day);
      setAnswer(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'The coach is unavailable. Try again.';
      // Not turned on yet on the server: show the step that turns it on.
      if (/Turn the coach on first/.test(message)) setOptedIn(false);
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Ask the coach" testID="ask-coach-sheet">
      <View style={styles.body}>
        {!optedIn && !answer ? (
          <>
            <Text style={[typeV2.body, { color: palette.text }]}>
              The coach answers one question about an Insight, in a sentence or three. It is off until you turn it on.
            </Text>
            <Text style={[typeV2.meta, { color: palette.secondary }]}>{WHAT_IS_SENT(insight)}</Text>
            <PillButton title="Turn the coach on" onPress={turnOn} busy={busy} testID="ask-coach-optin" />
          </>
        ) : (
          <>
            <View style={styles.choices}>
              {CHOICES.map((c) => {
                const on = insight === c.key;
                return (
                  <Tap
                    key={c.key}
                    testID={`ask-coach-${c.key}`}
                    onPress={() => {
                      setInsight(c.key);
                      setAnswer(null);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    style={[styles.chip, { backgroundColor: on ? palette.primary : palette.fill }]}
                  >
                    <Text style={[typeV2.meta, { color: on ? palette.onPrimary : palette.text, fontWeight: '600' }]}>{c.label}</Text>
                  </Tap>
                );
              })}
            </View>
            <Text style={[typeV2.meta, { color: palette.secondary }]}>{WHAT_IS_SENT(insight)}</Text>
            {answer ? (
              <View style={styles.answer}>
                <Text style={[typeV2.body, { color: palette.text }]} testID="ask-coach-answer">
                  {answer.answer}
                </Text>
                <Text style={[typeV2.meta, { color: palette.secondary }]}>
                  {answer.cached ? 'Kept for today. ' : ''}
                  {`${answer.remainingToday} ${answer.remainingToday === 1 ? 'question' : 'questions'} left today`}
                </Text>
              </View>
            ) : (
              <PillButton title="Ask" onPress={ask} busy={busy} testID="ask-coach-ask" />
            )}
          </>
        )}
        {error ? (
          <Text style={[typeV2.meta, { color: palette.secondary }]} testID="ask-coach-error">
            {error}
          </Text>
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: 12, paddingVertical: 8 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  answer: { gap: 8 },
});
