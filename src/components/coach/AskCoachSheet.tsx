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
import { t } from '../../i18n';

const CHOICES: { key: CoachInsight; label: string }[] = [
  { key: 'coverage', get label() { return t('coach.insights.coverage'); } },
  { key: 'consistency', get label() { return t('coach.insights.consistency'); } },
  { key: 'weakSpots', get label() { return t('coach.insights.weakSpots'); } },
  { key: 'pace', get label() { return t('coach.insights.pace'); } },
];

const WHAT_IS_SENT = (insight: CoachInsight) =>
  t('coach.whatIsSent', {
    insight: CHOICES.find((c) => c.key === insight)?.label.toLowerCase() ?? '',
    fields: COACH_FIELDS[insight].join(', '),
  });

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
      const message = err instanceof Error ? err.message : t('coach.unavailable');
      // Not turned on yet on the server: show the step that turns it on.
      if (/Turn the coach on first/.test(message)) setOptedIn(false);
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={t('coach.title')} testID="ask-coach-sheet">
      <View style={styles.body}>
        {!optedIn && !answer ? (
          <>
            <Text style={[typeV2.body, { color: palette.text }]}>
              {t('coach.intro')}
            </Text>
            <Text style={[typeV2.meta, { color: palette.secondary }]}>{WHAT_IS_SENT(insight)}</Text>
            <PillButton title={t('coach.turnOn')} onPress={turnOn} busy={busy} testID="ask-coach-optin" />
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
                  {answer.cached ? t('coach.kept') : ''}
                  {t('coach.left', { count: answer.remainingToday })}
                </Text>
              </View>
            ) : (
              <PillButton title={t('coach.ask')} onPress={ask} busy={busy} testID="ask-coach-ask" />
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
