import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { RECITERS, resolveVoice, STYLE_INFO } from '../../lib/recitation';

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
  const { theme } = useTheme();
  const current = resolveVoice(value);

  return (
    <ScrollView style={{ maxHeight }} contentContainerStyle={styles.content}>
      {RECITERS.map((r) => {
        const selected = r.id === current.reciter.id;
        return (
          <View key={r.id} style={styles.row}>
            <Pressable
              onPress={() => onChange(`${r.id}:${selected ? current.style : r.styles[0].style}`)}
              style={styles.nameRow}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={r.name}
            >
              <Text style={[typography.bodyMedium, { color: theme.textPrimary, flex: 1 }]}>{r.name}</Text>
              {selected && <Ionicons name="checkmark" size={18} color={theme.accent} />}
            </Pressable>
            {r.styles.length > 1 && (
              <View style={styles.chips}>
                {r.styles.map(({ style }) => {
                  const on = selected && current.style === style;
                  return (
                    <Pressable
                      key={style}
                      onPress={() => onChange(`${r.id}:${style}`)}
                      style={[
                        styles.chip,
                        { borderColor: theme.border, backgroundColor: theme.glass },
                        on && { borderColor: theme.accent, backgroundColor: theme.accent + '22' },
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={`${r.name}, ${STYLE_INFO[style].label}: ${STYLE_INFO[style].description}`}
                    >
                      <Text style={[typography.caption, { color: on ? theme.accent : theme.textSecondary }]}>
                        {STYLE_INFO[style].label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        );
      })}
      <Text style={[typography.caption, styles.note, { color: theme.textMuted }]}>
        Murattal: measured. Mujawwad: melodic, slower. Mu'allim: teaching, with a pause to repeat
        each verse.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingVertical: spacing.xs },
  row: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.xs },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  note: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
});
