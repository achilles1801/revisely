// The pieces of Activity's add sheets (mocks d5–d8), as the mocks draw them: a section label, the
// segmented What, a page range, the minutes field, a suggestion from the day, the strength choice, a
// tag chip and the closing info line. Each sheet (Revised, Memorized, Note) puts its own together.

import React from 'react';
import { InputAccessoryView, Keyboard, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { Tap } from '../v2/Tap';
import { typeV2 } from '../../theme/v2';
import { BLOCK_ICON, REVISED_ICON, type BlockKind } from './BlockMark';

const MAX_SCALE = 1.4;

/** The number pad has no return key: on iOS a Done bar above it puts it away (as the daily log's). */
export const KEYBOARD_DONE_ID = 'activity-keyboard-done';
const doneBar = Platform.OS === 'ios' ? KEYBOARD_DONE_ID : undefined;

/** The Done bar itself: render it once in a sheet with number fields. */
export function KeyboardDone() {
  const { palette } = useTheme();
  if (Platform.OS !== 'ios') return null;
  return (
    <InputAccessoryView nativeID={KEYBOARD_DONE_ID}>
      <View style={[styles.doneBar, { backgroundColor: palette.sheet, borderTopColor: palette.separator }]}>
        <Pressable onPress={() => Keyboard.dismiss()} accessibilityRole="button" accessibilityLabel="Done" testID="activity-keyboard-done" hitSlop={8}>
          <Text style={[typeV2.name, { color: palette.accentText }]}>Done</Text>
        </Pressable>
      </View>
    </InputAccessoryView>
  );
}

/** "WHAT", "MINUTES", "HOW DID IT GO?" with "Optional" on the right. */
export function FormLabel({ text, right }: { text: string; right?: string }) {
  const { palette } = useTheme();
  return (
    <View style={styles.label}>
      <Text style={[typeV2.meta, styles.labelText, { color: palette.secondary }]} maxFontSizeMultiplier={MAX_SCALE}>
        {text}
      </Text>
      {right ? (
        <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={MAX_SCALE}>
          {right}
        </Text>
      ) : null}
    </View>
  );
}

/** A segmented control: the chosen segment raised on the `bubble` track. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  testID,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  testID?: string;
}) {
  const { palette } = useTheme();
  return (
    <View style={[styles.segment, { backgroundColor: palette.bubble }]} accessibilityRole="tablist" testID={testID}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Tap
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.label}
            style={[styles.segBtn, on && [styles.segOn, { backgroundColor: palette.raised, shadowColor: palette.shadow }]]}
            testID={testID ? `${testID}-${o.value}` : undefined}
          >
            <Text style={[styles.segText, { color: on ? palette.text : palette.secondary }]} maxFontSizeMultiplier={MAX_SCALE}>
              {o.label}
            </Text>
          </Tap>
        );
      })}
    </View>
  );
}

/** From and To: two `p.` fields with "to" between them. */
export function PageRangeFields({
  from,
  to,
  onFrom,
  onTo,
  placeholders,
  testIDs,
}: {
  from: string;
  to: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
  /** "From" and "To" in the empty fields (the Memorized sheet). */
  placeholders?: boolean;
  testIDs: { from: string; to: string };
}) {
  const { palette } = useTheme();
  const box = (value: string, set: (v: string) => void, placeholder: string, label: string, testID: string) => (
    <View style={[styles.field, styles.flex, { backgroundColor: palette.bubble }]}>
      <Text style={[styles.prefix, { color: palette.secondary }]} maxFontSizeMultiplier={MAX_SCALE}>
        p.
      </Text>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={(v) => set(v.replace(/[^0-9]/g, ''))}
        placeholder={placeholders ? placeholder : undefined}
        placeholderTextColor={palette.secondary}
        keyboardType="number-pad"
        inputAccessoryViewID={doneBar}
        accessibilityLabel={label}
        maxFontSizeMultiplier={MAX_SCALE}
        style={[styles.input, { color: palette.text }]}
      />
    </View>
  );
  return (
    <View style={styles.pair}>
      {box(from, onFrom, 'From', 'From page', testIDs.from)}
      <Text style={[typeV2.meta, { color: palette.secondary }]}>to</Text>
      {box(to, onTo, 'To', 'To page', testIDs.to)}
    </View>
  );
}

/** The minutes, with "min" on the right. */
export function MinutesField({ value, onChange, testID }: { value: string; onChange: (v: string) => void; testID: string }) {
  const { palette } = useTheme();
  return (
    <View style={[styles.field, { backgroundColor: palette.bubble }]}>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={(v) => onChange(v.replace(/[^0-9]/g, ''))}
        placeholder="0"
        placeholderTextColor={palette.secondary}
        keyboardType="number-pad"
        inputAccessoryViewID={doneBar}
        accessibilityLabel="Minutes"
        maxFontSizeMultiplier={MAX_SCALE}
        style={[styles.input, { color: palette.text }]}
      />
      <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={MAX_SCALE}>
        min
      </Text>
    </View>
  );
}

/**
 * What the day suggests ("From your session", "From your reading"): its label, its words and one
 * action (Add, Use) in a solid pill, on the accent's subtle ground.
 */
export function Suggestion({
  label,
  text,
  action,
  onAction,
  disabled,
  accessibilityLabel,
  testID,
}: {
  label: string;
  text: string;
  action: string;
  onAction: () => void;
  disabled?: boolean;
  accessibilityLabel: string;
  testID?: string;
}) {
  const { palette } = useTheme();
  return (
    <View style={[styles.suggestion, { backgroundColor: palette.accentSubtle }]} testID={testID}>
      <Ionicons name="sparkles" size={18} color={palette.subtleText} />
      <View style={styles.flex}>
        <Text style={[typeV2.meta, styles.strong, { color: palette.subtleText }]} maxFontSizeMultiplier={MAX_SCALE}>
          {label}
        </Text>
        <Text style={[typeV2.body, { color: palette.text }]} maxFontSizeMultiplier={MAX_SCALE}>
          {text}
        </Text>
      </View>
      <Tap
        onPress={onAction}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={[styles.suggestionPill, { backgroundColor: palette.primary }]}
        testID={testID ? `${testID}-action` : undefined}
      >
        <Text style={[typeV2.name, { color: palette.onPrimary }]} maxFontSizeMultiplier={MAX_SCALE}>
          {action}
        </Text>
      </Tap>
    </View>
  );
}

/** A suggestion as one line ("From your session: the 2 pages it skipped", then Use or Undo). */
export function SuggestionLine({
  label,
  text,
  action,
  onPress,
  accessibilityLabel,
  testID,
}: {
  label: string;
  text: string;
  action: string;
  onPress: () => void;
  accessibilityLabel: string;
  testID?: string;
}) {
  const { palette } = useTheme();
  return (
    <Tap
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[styles.suggestionLine, { backgroundColor: palette.accentSubtle }]}
      testID={testID}
    >
      <Ionicons name="sparkles" size={16} color={palette.subtleText} />
      <Text style={[typeV2.meta, styles.flex, { color: palette.subtleText }]} maxFontSizeMultiplier={MAX_SCALE}>
        <Text style={styles.bold}>{label}</Text> {text}
      </Text>
      <Text style={[typeV2.meta, styles.strong, { color: palette.subtleText }]} maxFontSizeMultiplier={MAX_SCALE}>
        {action}
      </Text>
    </Tap>
  );
}

export type Strength = 'weak' | 'moderate' | 'strong';

/** Weak, Moderate, Strong: outline pills with their dot; the chosen one in ink. */
export function StrengthChoice({ value, onChange }: { value: Strength | null; onChange: (v: Strength | null) => void }) {
  const { palette } = useTheme();
  const options: { key: Strength; label: string; dot: string }[] = [
    { key: 'weak', label: 'Weak', dot: palette.red },
    { key: 'moderate', label: 'Moderate', dot: palette.secondary },
    { key: 'strong', label: 'Strong', dot: palette.good },
  ];
  return (
    <View style={styles.choices}>
      {options.map((o) => {
        const on = value === o.key;
        return (
          <Tap
            key={o.key}
            testID={`add-revised-strength-${o.key}`}
            onPress={() => onChange(on ? null : o.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.label}
            style={[styles.choice, on ? { backgroundColor: palette.text } : { borderWidth: 1, borderColor: palette.outline }]}
          >
            <View style={[styles.choiceDot, { backgroundColor: o.dot }]} />
            <Text style={[typeV2.name, { color: on ? palette.bg : palette.text }]} maxFontSizeMultiplier={MAX_SCALE}>
              {o.label}
            </Text>
          </Tap>
        );
      })}
    </View>
  );
}

/** A note's "Show under" choice: the block's icon and name, in ink when chosen. */
export function TagChip({
  kind,
  label,
  on,
  onPress,
  testID,
}: {
  kind: BlockKind;
  label: string;
  on: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const { palette } = useTheme();
  const icon = kind === 'revised' ? REVISED_ICON : BLOCK_ICON[kind];
  return (
    <Tap
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={label}
      style={[styles.tag, on ? { backgroundColor: palette.text } : { borderWidth: 1, borderColor: palette.outline }]}
      testID={testID}
    >
      <Ionicons name={icon} size={13} color={on ? palette.bg : palette.secondary} />
      <Text style={[typeV2.meta, styles.strong, { color: on ? palette.bg : palette.text }]} maxFontSizeMultiplier={MAX_SCALE}>
        {label}
      </Text>
    </Tap>
  );
}

/** The closing line: an ⓘ and what the add will do. */
export function InfoLine({ text, testID }: { text: string; testID?: string }) {
  const { palette } = useTheme();
  return (
    <View style={styles.info} testID={testID}>
      <Ionicons name="information-circle-outline" size={15} color={palette.secondary} style={styles.infoIcon} />
      <Text style={[typeV2.meta, styles.flex, { color: palette.secondary }]} maxFontSizeMultiplier={MAX_SCALE}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  strong: { fontWeight: '600' },
  bold: { fontWeight: '700' },
  label: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, marginBottom: 8, marginHorizontal: 2 },
  labelText: { fontWeight: '600' },
  segment: { flexDirection: 'row', padding: 2, borderRadius: 11 },
  segBtn: { flex: 1, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segOn: { shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  segText: { fontSize: 14, lineHeight: 20, fontWeight: '600', letterSpacing: -0.23 },
  pair: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  field: { flexDirection: 'row', alignItems: 'center', height: 48, paddingHorizontal: 14, borderRadius: 14 },
  prefix: { fontSize: 13, marginRight: 6 },
  input: { flex: 1, padding: 0, fontSize: 16, fontVariant: ['tabular-nums'] },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingLeft: 14, paddingRight: 12, borderRadius: 16 },
  suggestionPill: { height: 32, paddingHorizontal: 14, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  suggestionLine: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14 },
  choices: { flexDirection: 'row', gap: 8 },
  choice: { flex: 1, height: 38, borderRadius: 19, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  choiceDot: { width: 7, height: 7, borderRadius: 3.5 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 28, paddingHorizontal: 10, borderRadius: 14 },
  info: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 18 },
  doneBar: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  infoIcon: { marginTop: 1 },
});
