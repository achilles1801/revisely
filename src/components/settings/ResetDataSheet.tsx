import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Sheet } from '../v2/Sheet';
import { PillButton } from '../v2/PillButton';
import { useTheme } from '../../context/ThemeContext';
import { radiusV2, typeV2 } from '../../theme/v2';
import { useHaptics } from '../../design/haptics';
import { resetMyData } from '../../lib/testerReset';

const CONFIRM = 'RESET';

/**
 * Settings → Reset my data (testers): typing RESET arms the red button. While
 * the server resets, the sheet stays up and can't be closed; on success the app
 * goes to onboarding by itself (the new account has it to do), on failure the
 * reason shows here and nothing on the phone is cleared.
 */
export function ResetDataSheet({
  visible,
  onClose,
  reset = resetMyData,
}: {
  visible: boolean;
  onClose: () => void;
  /** Tests: stands in for lib/testerReset. */
  reset?: () => Promise<unknown>;
}) {
  const { palette } = useTheme();
  const haptics = useHaptics();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = text.trim() === CONFIRM;

  const close = () => {
    if (busy) return;
    setText('');
    setError(null);
    onClose();
  };

  const confirm = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      await reset();
      haptics.warning();
      setText('');
      onClose();
    } catch (err) {
      setError((err as Error)?.message || 'The reset failed. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={close}
      keyboard
      title="Reset my data"
      left={{ label: 'Cancel', onPress: close, testID: 'reset-data-cancel' }}
      testID="reset-data-sheet"
    >
      <View style={styles.body}>
        <Text style={[typeV2.meta, { color: palette.secondary }]}>
          Your progress, plan, sessions, daily log, reading times and recordings are deleted, here and in your
          backup, and onboarding starts again. You stay signed in. A copy is kept that only the developer can read.
        </Text>
        <Text style={[typeV2.meta, { color: palette.text }]}>Type {CONFIRM} to confirm.</Text>
        <TextInput
          value={text}
          onChangeText={(t) => {
            setText(t);
            if (error) setError(null);
          }}
          placeholder={CONFIRM}
          placeholderTextColor={palette.secondary}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          editable={!busy}
          returnKeyType="done"
          onSubmitEditing={confirm}
          selectionColor={palette.accentText}
          style={[typeV2.body, styles.input, { color: palette.text, backgroundColor: palette.fill }]}
          accessibilityLabel={`Type ${CONFIRM} to confirm`}
          testID="reset-data-input"
        />
        {error ? (
          <Text style={[typeV2.meta, { color: palette.red }]} accessibilityRole="alert" testID="reset-data-error">
            {error}
          </Text>
        ) : null}
        <PillButton
          title={busy ? 'Resetting…' : 'Reset my data'}
          onPress={confirm}
          size="lg"
          destructive
          disabled={!ready}
          busy={busy}
          testID="reset-data-confirm"
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingTop: 8, paddingBottom: 4, gap: 12 },
  input: { borderRadius: radiusV2.media, paddingHorizontal: 14, paddingVertical: 12 },
});
