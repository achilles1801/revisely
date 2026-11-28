// Sign-in B's fields: one Settings-style group, a row a field, its label at the start and what's typed after it
// (board ~/Documents/revisely-auth-mocks/v2/png/B2). At large text sizes each label sits over its field, so a long label
// (Arabic's «البريد الإلكتروني») or a long email never squeezes the other. A field at fault turns the group's edge and its
// label red (AUTH-4).

import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TextInputProps, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Tap } from '../../../components/v2/Tap';
import { useTheme } from '../../../context/ThemeContext';
import { layoutV2, radiusV2, typeV2 } from '../../../theme/v2';
import { t } from '../../../i18n';

/** From this text size on, labels sit over their fields. */
export const STACK_FROM_SCALE = 1.3;

export interface FieldSpec extends TextInputProps {
  key: string;
  label: string;
  /** A password: hidden unless its eye shows it. */
  secret?: boolean;
  testID: string;
}

function Row({ spec, wrong, stacked, last }: { spec: FieldSpec; wrong: boolean; stacked: boolean; last: boolean }) {
  const { palette } = useTheme();
  const [shown, setShown] = useState(false);
  const { label, secret, testID, key: _key, ...input } = spec;
  return (
    <View
      style={[styles.row, stacked && styles.stacked, !last && { borderBottomWidth: layoutV2.hairline, borderBottomColor: palette.separator }]}
      testID={`${testID}-row`}
    >
      <Text
        style={[typeV2.menu, stacked ? null : styles.label, { color: wrong ? palette.red : palette.text }]}
        maxFontSizeMultiplier={2}
        testID={`${testID}-label`}
      >
        {label}
      </Text>
      <View style={styles.value}>
        <TextInput
          {...input}
          style={[typeV2.menu, styles.input, { color: palette.text }]}
          placeholderTextColor={palette.secondary}
          secureTextEntry={secret ? !shown : undefined}
          accessibilityLabel={label}
          maxFontSizeMultiplier={2}
          testID={testID}
        />
        {secret ? (
          <Tap
            onPress={() => setShown(!shown)}
            hitSlop={8}
            style={styles.eye}
            accessibilityRole="button"
            accessibilityLabel={shown ? t('auth.screen.hidePassword') : t('auth.screen.showPassword')}
            testID={`${testID}-reveal`}
          >
            <Ionicons name={shown ? 'eye-off-outline' : 'eye-outline'} size={22} color={palette.secondary} />
          </Tap>
        ) : null}
      </View>
    </View>
  );
}

export function FieldGroup({ fields, wrong, testID }: { fields: FieldSpec[]; wrong: string | null; testID: string }) {
  const { palette } = useTheme();
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale >= STACK_FROM_SCALE;
  return (
    <View
      style={[styles.group, { backgroundColor: palette.fill, borderColor: wrong ? palette.red : palette.fill }]}
      testID={testID}
    >
      {fields.map((f, i) => (
        <Row key={f.key} spec={f} wrong={wrong === f.key} stacked={stacked} last={i === fields.length - 1} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { borderRadius: radiusV2.cancel, borderWidth: 1.5, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingStart: 16, paddingEnd: 8, gap: 12 },
  stacked: { flexDirection: 'column', alignItems: 'stretch', gap: 2, paddingTop: 10, paddingBottom: 4 },
  // Wide enough for "Password"; a longer label wraps rather than being cut.
  label: { width: 96, flexShrink: 0 },
  value: { flex: 1, flexDirection: 'row', alignItems: 'center', minWidth: 0 },
  input: { flex: 1, paddingVertical: 12, paddingEnd: 8 },
  eye: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
