import React, { useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import type { RevoAttachment } from '../../lib/revo/types';
import { Tap } from '../v2/Tap';
import { ContextChip } from './RevoParts';

export const QUESTION_MAX = 600;

/**
 * Where the user asks: + (Add to chat: RevoAddSheet), the field ("Ask Revo anything", with the mic
 * for dictation), and what's attached as chips above it, each with ×. Off (`disabled`) when the
 * day's questions are used: 45% and the placeholder says when Revo is back.
 */
export function RevoComposer({
  onSend,
  onAdd,
  attachments,
  onRemoveAttach,
  disabled,
  disabledText,
  busy,
  onFocus,
}: {
  onSend: (text: string) => void;
  onAdd: () => void;
  attachments: RevoAttachment[];
  onRemoveAttach: (index: number) => void;
  disabled: boolean;
  disabledText: string;
  busy: boolean;
  onFocus?: () => void;
}) {
  const { palette, isDark } = useTheme();
  const [text, setText] = useState('');
  const input = useRef<TextInput>(null);
  const canSend = !disabled && !busy && text.trim().length > 0;
  const send = () => {
    if (!canSend) return;
    onSend(text.trim());
    setText('');
  };
  return (
    <View style={[styles.wrap, disabled && styles.off]}>
      {attachments.length > 0 ? (
        <View style={styles.chips}>
          {attachments.map((a, i) => (
            <ContextChip key={`${a.kind}-${a.label}-${i}`} label={a.label} kind={a.kind} onRemove={() => onRemoveAttach(i)} />
          ))}
        </View>
      ) : null}
      <View style={styles.row}>
        <Tap
          onPress={onAdd}
          disabled={disabled}
          style={[styles.plus, { backgroundColor: palette.bubble }]}
          accessibilityRole="button"
          accessibilityLabel="Add to chat"
          accessibilityState={{ disabled }}
          testID="revo-plus"
        >
          <Ionicons name="add" size={26} color={palette.text} />
        </Tap>
        <View style={[styles.field, { backgroundColor: palette.bubble }]}>
          {/* The outline: primary at 35% (55% in dark). */}
          <View pointerEvents="none" style={[styles.ring, { borderColor: palette.primary, opacity: isDark ? 0.55 : 0.35 }]} />
          <TextInput
            ref={input}
            value={text}
            onChangeText={(t) => setText(t.slice(0, QUESTION_MAX))}
            editable={!disabled}
            placeholder={disabled ? disabledText : 'Ask Revo anything'}
            placeholderTextColor={palette.secondary}
            style={[styles.input, { color: palette.text }]}
            multiline
            maxLength={QUESTION_MAX}
            onFocus={() => onFocus?.()}
            submitBehavior="blurAndSubmit"
            returnKeyType="send"
            onSubmitEditing={send}
            accessibilityLabel="Ask Revo anything"
            testID="revo-input"
          />
          {text.trim().length > 0 ? (
            <Tap
              onPress={send}
              disabled={!canSend}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Send"
              testID="revo-send"
            >
              <Ionicons name="arrow-up-circle" size={30} color={canSend ? palette.primary : palette.secondary} />
            </Tap>
          ) : (
            <Tap
              // Dictation is the keyboard's own: the mic opens the field with the keyboard up.
              onPress={() => input.current?.focus()}
              disabled={disabled}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Dictate with the keyboard"
              testID="revo-mic"
            >
              <Ionicons name="mic-outline" size={20} color={palette.secondary} />
            </Tap>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  off: { opacity: 0.45 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  plus: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  field: {
    flex: 1,
    minHeight: 44,
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 12,
    gap: 8,
  },
  ring: { ...StyleSheet.absoluteFillObject, borderRadius: 22, borderWidth: 1 },
  input: { flex: 1, fontSize: 16, lineHeight: 21, paddingTop: 11, paddingBottom: 11, maxHeight: 120 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
