import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { typeV2 } from '../../theme/v2';
import { Sheet } from './Sheet';

export interface GuideStep {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
}

/** "How it works" in the new design: a sheet of steps (icon, name, a line or two), "Got it" at the foot. */
export function GuideSheet({
  visible,
  onClose,
  title,
  steps,
  testID,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  steps: GuideStep[];
  testID?: string;
}) {
  const { palette } = useTheme();
  return (
    <Sheet visible={visible} onClose={onClose} title={title} scroll footer={{ label: 'Got it', onPress: onClose }} testID={testID}>
      {steps.map((s) => (
        <View key={s.title} style={styles.step}>
          <Ionicons name={s.icon} size={24} color={palette.text} />
          <View style={styles.text}>
            <Text style={[typeV2.name, { color: palette.text }]}>{s.title}</Text>
            <Text style={[typeV2.body, { color: palette.secondary }]}>{s.body}</Text>
          </View>
        </View>
      ))}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  step: { flexDirection: 'row', gap: 16, paddingVertical: 12 },
  text: { flex: 1, gap: 2 },
});
