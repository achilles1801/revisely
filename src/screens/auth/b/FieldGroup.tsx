// Sign-in B's fields: one Settings-style group, a row a field, its label at the start and what's typed after it
// (board ~/Documents/revisely-auth-mocks/v2/png/B2). A long label (Arabic's «البريد الإلكتروني») wraps in its column, and a
// long email scrolls inside its own field. Their text grows with the phone's text size only up to CAP_FIELD, so the email
// page stays static (Majd, Nov 28 2026). A field at fault turns the group's edge and its label red (AUTH-4).

import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Tap } from '../../../components/v2/Tap';
import { useTheme } from '../../../context/ThemeContext';
import { layoutV2, radiusV2, typeV2 } from '../../../theme/v2';
import { t } from '../../../i18n';

/** How far a field's label and text grow with the phone's text size. */
export const CAP_FIELD = 1.25;

export interface FieldSpec extends TextInputProps {
  key: string;
  label: string;
  /** A password: hidden unless its eye shows it. */
  secret?: boolean;
  testID: string;
}

function Row({ spec, wrong, last }: { spec: FieldSpec; wrong: boolean; last: boolean }) {
  const { palette } = useTheme();
  const [shown, setShown] = useState(false);
  const { label, secret, testID, key: _key, ...input } = spec;
  return (
    <View
      style={[styles.row, !last && { borderBottomWidth: layoutV2.hairline, borderBottomColor: palette.separator }]}
      testID={`${testID}-row`}
    >
      <Text
        style={[typeV2.menu, styles.label, { color: wrong ? palette.red : palette.text }]}
        maxFontSizeMultiplier={CAP_FIELD}
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
          maxFontSizeMultiplier={CAP_FIELD}
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
  return (
    <View
      style={[styles.group, { backgroundColor: palette.fill, borderColor: wrong ? palette.red : palette.fill }]}
      testID={testID}
    >
      {fields.map((f, i) => (
        <Row key={f.key} spec={f} wrong={wrong === f.key} last={i === fields.length - 1} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { borderRadius: radiusV2.cancel, borderWidth: 1.5, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingStart: 16, paddingEnd: 8, gap: 12 },
  // Wide enough for "Password" and two lines of «البريد الإلكتروني»; a longer label wraps rather than being cut.
  label: { width: 120, flexShrink: 0 },
  value: { flex: 1, flexDirection: 'row', alignItems: 'center', minWidth: 0 },
  input: { flex: 1, paddingVertical: 10, paddingEnd: 8 },
  eye: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
