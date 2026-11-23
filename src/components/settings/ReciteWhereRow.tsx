import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { layoutV2, typeV2 } from '../../theme/v2';
import { Tap } from '../v2/Tap';
import { t } from '../../i18n';
import { warmEngine, whereNow } from '../../lib/onDevice/engine';
import type { RunsOn, WhereAnswer } from '../../lib/reciteLive/where';
import { reciteWhere, setTestingChoice } from '../../lib/reciteLive/whereSettings';

const ORDER: (RunsOn | null)[] = [null, 'phone', 'server'];

const choiceLabel = (c: RunsOn | null): string =>
  c === 'phone' ? t('settings.testing.wherePhone') : c === 'server' ? t('settings.testing.whereServer') : t('settings.testing.whereAuto');

/** Where the next take runs, and what kept it off the phone. */
export function nextTakeLine(a: WhereAnswer): string {
  if (a.on === 'phone') return a.why === 'replay' ? t('settings.testing.whereNextReplay') : t('settings.testing.whereNextPhone');
  switch (a.why) {
    case 'forced':
    case 'pin':
    case 'config':
      return t('settings.testing.whereNextServer');
    case 'no-pack':
      return t('settings.testing.whereNextNoEngine');
    case 'self-check':
      return t('settings.testing.whereNextCheck');
    case 'no-speed':
      return t('settings.testing.whereNextSpeed');
    case 'slow':
      return t('settings.testing.whereNextSlow');
    default:
      return t('settings.testing.whereNextLacks');
  }
}

/**
 * Settings → Testing, Revisely Dev only (ONDEV-4): where this phone's takes run. A tap moves through Automatic (what
 * the team has set), this phone and the server. Whatever it says, a take the engine can't run goes to the server.
 */
export function ReciteWhereRow({ now = whereNow }: { now?: () => WhereAnswer }) {
  const { palette } = useTheme();
  const [choice, setChoice] = useState<RunsOn | null>(() => reciteWhere().testing);

  const next = () => {
    const to = ORDER[(ORDER.indexOf(choice) + 1) % ORDER.length];
    setTestingChoice(to);
    setChoice(to);
    if (to === 'phone') warmEngine();
  };

  const label = t('settings.testing.where');
  const value = choiceLabel(choice);
  const line = nextTakeLine(now());

  return (
    <Tap
      onPress={next}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value}. ${line}`}
      accessibilityHint={t('settings.testing.whereHint')}
      testID="settings-recite-where"
    >
      <View style={styles.row}>
        <Ionicons name="phone-portrait-outline" size={24} color={palette.text} />
        <View style={styles.text}>
          <Text style={[typeV2.body, { color: palette.text }]}>{label}</Text>
          <Text style={[typeV2.meta, { color: palette.secondary }]} testID="settings-recite-where-next">
            {line}
          </Text>
        </View>
        <Text style={[typeV2.meta, { color: palette.secondary }]} testID="settings-recite-where-value">
          {value}
        </Text>
      </View>
    </Tap>
  );
}

// The Settings rows' metrics (16pt gutter, a 24pt glyph, 16pt to the label), as CheckerModelRow's.
const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    minHeight: 52,
    paddingVertical: 12,
    paddingHorizontal: layoutV2.gutter,
  },
  text: { flex: 1 },
});
