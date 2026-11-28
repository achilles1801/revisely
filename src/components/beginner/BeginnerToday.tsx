import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { t } from '../../i18n';
import { NBSP, spoken, type TodayLines, type TodayStatus } from '../../lib/todayLines';
import { surahNameIn } from '../../lib/passages';
import { typeV2 } from '../../theme/v2';
import { Tap } from '../v2/Tap';

/** The quiet line under the ring grows as the ring's lines do (two at most at the largest size, TodayRing). */
const QUIET_MAX_SCALE = 1.6;

/** A quiet line under a beginner's ring (BEGIN-2, BEGIN-3): grey words, then the accent action, all one tap. */
export function BeginnerQuietLine({ lead, action, onPress, testID }: { lead: string; action: string; onPress: () => void; testID: string }) {
  const { palette } = useTheme();
  return (
    <Tap onPress={onPress} hitSlop={6} accessibilityRole="button" accessibilityLabel={`${lead} ${action}`} style={styles.quiet} testID={testID}>
      <Text style={[typeV2.meta, styles.center, { color: palette.secondary }]} maxFontSizeMultiplier={QUIET_MAX_SCALE}>
        {lead}
        {NBSP}
        {NBSP}
        {/* Held together, so the action never starts a line alone. */}
        <Text style={[styles.action, { color: palette.accentText }]} testID={`${testID}-action`}>
          {action.split(' ').join(NBSP)}
        </Text>
      </Text>
    </Tap>
  );
}

/** What the ring shows for a beginner instead of today's lines, its button's action, and the quiet line under it. */
export interface BeginnerRing {
  lines: TodayLines;
  /** The button's action when it differs from today's (Start with Al-Fatihah); else today's. */
  onPrimary?: () => void;
  footer: React.ReactNode;
}

/**
 * A beginner's Home (BEGIN-2, BEGIN-3; Revisely Dev), drawn with Home's ring (HOME-10). With nothing memorized: "Start with
 * Al-Fatihah", how (hold an ayah to hear it and see its meaning, mark it once known), "Open Al-Fatihah", and "Know some
 * surahs already? Mark them". With surahs: today's ring and lines as for anyone, about how long what's left takes after
 * the second line, and "Learned another surah? Add it". Both quiet lines open Your surahs (BEGIN-5).
 */
export function beginnerRing({
  lines,
  status,
  minutes,
  onStart,
  onSurahs,
}: {
  lines: TodayLines;
  status: TodayStatus;
  /** About how long today's pages still to revise take (lib/beginner/surahs minutesFor). */
  minutes: number;
  onStart: () => void;
  onSurahs: () => void;
}): BeginnerRing {
  if (lines.empty && !lines.rest) {
    const surah = surahNameIn(1);
    const title = t('beginner.home.startTitle', { surah });
    const brief = t('beginner.home.startBrief');
    return {
      lines: {
        title: { text: title, dot: false, chevron: false },
        detail: { kind: 'text', text: brief },
        brief,
        total: 0,
        label: spoken(t('lib.today.titleDetail', { title, detail: brief })),
        empty: true,
        cta: t('beginner.home.startCta', { surah }),
        solid: true,
      },
      onPrimary: onStart,
      footer: (
        <BeginnerQuietLine lead={t('beginner.home.markLead')} action={t('beginner.home.mark')} onPress={onSurahs} testID="beginner-mark" />
      ),
    };
  }
  const footer = (
    <BeginnerQuietLine lead={t('beginner.home.addLead')} action={t('beginner.home.add')} onPress={onSurahs} testID="beginner-add" />
  );
  // Done or resting: nothing left to time.
  if (lines.rest || status === 'completed' || minutes <= 0) return { lines, footer };
  const time = t('beginner.home.minutes', { count: minutes });
  return {
    lines: {
      ...lines,
      brief: lines.brief ? `${lines.brief}${NBSP}·${NBSP}${time}` : time,
      label: `${lines.label}. ${time}`,
    },
    footer,
  };
}

const styles = StyleSheet.create({
  quiet: { marginTop: 14, alignSelf: 'stretch' },
  center: { textAlign: 'center' },
  action: { fontWeight: '600' },
});
