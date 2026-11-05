import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Sheet } from '../v2/Sheet';
import { PillButton } from '../v2/PillButton';
import { Tap } from '../v2/Tap';
import { useTheme } from '../../context/ThemeContext';
import { useApp } from '../../context/AppContext';
import { radiusV2, typeV2 } from '../../theme/v2';
import { useHaptics } from '../../design/haptics';
import { TEST_SCENARIOS, loadTestScenario } from '../../lib/testScenarios';
import { isSyncHeld, onSyncState } from '../../lib/offline/sync';

const CONFIRM = 'RESET';

/** Whether the account's changes are held on this phone (the Offline queue scenario). */
export function useSyncHeld(uid: string | null | undefined): boolean {
  const [held, setHeld] = useState(() => isSyncHeld(uid));
  useEffect(() => {
    setHeld(isSyncHeld(uid));
    return onSyncState(() => setHeld(isSyncHeld(uid)));
  }, [uid]);
  return held;
}

/**
 * Settings → Load test scenario (testers): pick a scenario, type RESET, and the
 * account is reset and filled with it (lib/testScenarios). While the server
 * works the sheet stays up and can't be closed; on success it closes and the
 * app shows the new account; on failure the reason shows here and nothing on
 * the phone is cleared.
 */
export function TestScenarioSheet({
  visible,
  onClose,
  load,
}: {
  visible: boolean;
  onClose: () => void;
  /** Tests: stands in for lib/testScenarios. */
  load?: (scenario: string) => Promise<unknown>;
}) {
  const { palette } = useTheme();
  const { user } = useApp();
  const haptics = useHaptics();
  const [picked, setPicked] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = picked != null && text.trim() === CONFIRM;

  const close = () => {
    if (busy) return;
    setText('');
    setError(null);
    onClose();
  };

  const confirm = async () => {
    if (!ready || busy || !picked) return;
    setBusy(true);
    setError(null);
    try {
      await (load ? load(picked) : loadTestScenario(picked, user));
      haptics.success();
      setText('');
      onClose();
    } catch (err) {
      setError((err as Error)?.message || 'The scenario did not load. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const chosen = TEST_SCENARIOS.find((s) => s.id === picked);

  return (
    <Sheet
      visible={visible}
      onClose={close}
      keyboard
      scroll
      title="Load test scenario"
      left={{ label: 'Cancel', onPress: close, testID: 'test-scenario-cancel' }}
      testID="test-scenario-sheet"
    >
      <View style={styles.body}>
        <Text style={[typeV2.meta, { color: palette.secondary }]}>
          Your data is replaced by the scenario, here and in your backup, as Reset my data does it. A copy is kept that
          only the developer can read. TESTING-CHECKLIST.md says what to look at in each.
        </Text>
        <View accessibilityRole="radiogroup">
          {TEST_SCENARIOS.map((s) => {
            const on = s.id === picked;
            return (
              <Tap
                key={s.id}
                onPress={() => {
                  if (busy) return;
                  setPicked(s.id);
                  if (error) setError(null);
                }}
                style={[styles.option, { borderColor: on ? palette.primary : palette.outline }]}
                accessibilityRole="radio"
                accessibilityState={{ selected: on, disabled: busy }}
                accessibilityLabel={`${s.title}. ${s.detail}`}
                testID={`test-scenario-${s.id}`}
              >
                <Ionicons
                  name={on ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={on ? palette.primary : palette.secondary}
                />
                <View style={styles.optionText}>
                  <Text style={[typeV2.body, { color: palette.text }]}>{s.title}</Text>
                  <Text style={[typeV2.meta, { color: palette.secondary }]}>{s.detail}</Text>
                </View>
              </Tap>
            );
          })}
        </View>
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
          testID="test-scenario-input"
        />
        {error ? (
          <Text style={[typeV2.meta, { color: palette.red }]} accessibilityRole="alert" testID="test-scenario-error">
            {error}
          </Text>
        ) : null}
        <PillButton
          title={busy ? 'Loading…' : chosen ? `Load ${chosen.title}` : 'Pick a scenario'}
          onPress={confirm}
          size="lg"
          destructive
          disabled={!ready}
          busy={busy}
          testID="test-scenario-confirm"
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingTop: 8, paddingBottom: 4, gap: 12 },
  option: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: radiusV2.media,
    marginBottom: 8,
  },
  optionText: { flex: 1, gap: 2 },
  input: { borderRadius: radiusV2.media, paddingHorizontal: 14, paddingVertical: 12 },
});
