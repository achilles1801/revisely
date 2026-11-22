import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { layoutV2, typeV2 } from '../../theme/v2';
import { Tap } from '../v2/Tap';
import { t } from '../../i18n';
import { CheckerModels, readCheckerModels, shortModel } from '../../lib/reciteCheck/checkerModel';

type State = { kind: 'reading' } | { kind: 'read'; models: CheckerModels } | { kind: 'failed' };

/** "Recite v7 · Words & harakat v7 · Strict v5". */
export function modelsLine(m: CheckerModels): string {
  return t('settings.testing.modelLine', {
    recite: shortModel(m.recite),
    harakat: shortModel(m.harakat),
    strict: shortModel(m.strict),
  });
}

/**
 * Settings → Testing, Revisely Dev only: which model the app's checker runs for each level, read from its /health when
 * Settings opens. A tap reads it again. Unreachable: says so, never a guess.
 */
export function CheckerModelRow({ read = readCheckerModels }: { read?: () => Promise<CheckerModels | null> }) {
  const { palette } = useTheme();
  const [state, setState] = useState<State>({ kind: 'reading' });
  const live = useRef(true);
  const reading = useRef(false);

  const load = useCallback(() => {
    if (reading.current) return;
    reading.current = true;
    setState({ kind: 'reading' });
    void read().then((models) => {
      reading.current = false;
      if (live.current) setState(models ? { kind: 'read', models } : { kind: 'failed' });
    });
  }, [read]);

  useEffect(() => {
    live.current = true;
    load();
    return () => {
      live.current = false;
    };
  }, [load]);

  const label = t('settings.testing.model');
  const detail =
    state.kind === 'read'
      ? modelsLine(state.models)
      : state.kind === 'failed'
        ? t('settings.testing.modelFailed')
        : t('settings.testing.modelReading');
  const server = state.kind === 'read' && state.models.server ? t('settings.testing.modelServer', { server: state.models.server }) : null;

  return (
    <Tap
      onPress={load}
      accessibilityRole="button"
      accessibilityLabel={[label, detail, server].filter(Boolean).join(', ')}
      accessibilityHint={t('settings.testing.modelHint')}
      testID="settings-checker-model"
    >
      <View style={styles.row}>
        <Ionicons name="hardware-chip-outline" size={24} color={palette.text} />
        <View style={styles.text}>
          <Text style={[typeV2.body, { color: palette.text }]}>{label}</Text>
          <Text style={[typeV2.meta, { color: palette.secondary }]} testID="settings-checker-model-detail">
            {detail}
          </Text>
          {server ? <Text style={[typeV2.meta, typeV2.numeral, { color: palette.secondary }]}>{server}</Text> : null}
        </View>
      </View>
    </Tap>
  );
}

// The Settings rows' metrics (16pt gutter, a 24pt glyph, 16pt to the label), as AppInfo's.
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
