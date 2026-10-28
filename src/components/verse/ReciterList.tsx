import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { RECITERS, resolveVoice, STYLE_INFO } from '../../lib/recitation';
import { radiusV2, typeV2 } from '../../theme/v2';
import { Tap } from '../v2/Tap';

/** Names and chips grow with Dynamic Type only this far (chrome). */
const CHROME_TEXT_SCALE = 1.4;

interface ReciterListProps {
  /** The saved choice ('<reciter>:<style>'). */
  value: string | undefined;
  onChange: (choice: string) => void;
  maxHeight?: number;
}

/**
 * Reciters, each with its styles (Murattal, Mujawwad, Mu'allim) as chips.
 * Tapping a reciter picks its first style.
 */
export function ReciterList({ value, onChange, maxHeight = 360 }: ReciterListProps) {
  const { palette } = useTheme();
  const current = resolveVoice(value);

  // Menu rows (the chosen one checked in ink), each style a pill: solid when chosen.
  return (
    <ScrollView style={{ maxHeight }} contentContainerStyle={v2.content} testID="reciter-list">
      {RECITERS.map((r) => {
        const selected = r.id === current.reciter.id;
        return (
          <View key={r.id} style={v2.row}>
            <Tap
              onPress={() => onChange(`${r.id}:${selected ? current.style : r.styles[0].style}`)}
              style={v2.nameRow}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={r.name}
            >
              <Text style={[typeV2.menu, v2.name, { color: palette.text }]} maxFontSizeMultiplier={CHROME_TEXT_SCALE}>
                {r.name}
              </Text>
              {selected && <Ionicons name="checkmark" size={20} color={palette.text} />}
            </Tap>
            {r.styles.length > 1 && (
              <View style={v2.chips}>
                {r.styles.map(({ style }) => {
                  const on = selected && current.style === style;
                  return (
                    <Tap
                      key={style}
                      onPress={() => onChange(`${r.id}:${style}`)}
                      style={[
                        v2.chip,
                        on
                          ? { backgroundColor: palette.primary, borderColor: palette.primary }
                          : { borderColor: palette.outline },
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={`${r.name}, ${STYLE_INFO[style].label}: ${STYLE_INFO[style].description}`}
                      testID={`reciter-style-${r.id}-${style}`}
                    >
                      <Text
                        style={[typeV2.meta, v2.chipText, { color: on ? palette.onPrimary : palette.text }]}
                        maxFontSizeMultiplier={CHROME_TEXT_SCALE}
                      >
                        {STYLE_INFO[style].label}
                      </Text>
                    </Tap>
                  );
                })}
              </View>
            )}
          </View>
        );
      })}
      <Text style={[typeV2.meta, v2.note, { color: palette.secondary }]}>
        Murattal: measured. Mujawwad: melodic, slower. Mu'allim: teaching, with a pause to repeat
        each verse.
      </Text>
    </ScrollView>
  );
}

const v2 = StyleSheet.create({
  content: { paddingVertical: 4 },
  row: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  nameRow: { flexDirection: 'row', alignItems: 'center', minHeight: 32 },
  name: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 30,
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderRadius: radiusV2.pill,
    borderWidth: 1,
  },
  chipText: { fontWeight: '600' },
  note: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 },
});
