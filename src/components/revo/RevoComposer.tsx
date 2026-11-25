import React, { useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import type { RevoAttachment } from '../../lib/revo/types';
import { Tap } from '../v2/Tap';
import { ContextChip } from './RevoParts';
import { useDictation } from './useDictation';
import { t } from '../../i18n';

export const QUESTION_MAX = 600;

/**
 * Where the user asks: + (Add to chat: RevoAddSheet), the field ("Ask Revo anything"), and what's attached as chips
 * above it, each with ×. The field ends in its mic while it's empty, where the build has the speech module (REVO-42:
 * Revisely Dev until the native release), and in send otherwise. Off (`disabled`) when the
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
  const speech = useDictation((heard) => setText(heard.slice(0, QUESTION_MAX)));
  const send = () => {
    if (!canSend) return;
    speech.stop();
    onSend(text.trim());
    setText('');
  };
  const placeholder = disabled
    ? disabledText
    : speech.listening
      ? t('revo.composer.listening')
      : speech.denied
        ? t('revo.composer.speechDenied')
        : t('revo.composer.placeholder');
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
          accessibilityLabel={t('revo.add.title')}
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
            onChangeText={(value) => setText(value.slice(0, QUESTION_MAX))}
            editable={!disabled}
            placeholder={placeholder}
            placeholderTextColor={palette.secondary}
            style={[styles.input, { color: palette.text }]}
            multiline
            maxLength={QUESTION_MAX}
            onFocus={() => onFocus?.()}
            submitBehavior="blurAndSubmit"
            returnKeyType="send"
            onSubmitEditing={send}
            accessibilityLabel={t('revo.composer.placeholder')}
            testID="revo-input"
          />
          {speech.listening ? (
            <Tap
              onPress={speech.stop}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('revo.composer.stopDictating')}
              testID="revo-dictate-stop"
            >
              <Ionicons name="stop-circle" size={30} color={palette.primary} />
            </Tap>
          ) : speech.available && text.trim().length === 0 ? (
            // REVO-42: speak the question; the words appear in the field as they're heard
            <Tap
              onPress={() => speech.start(text)}
              disabled={disabled}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('revo.composer.dictate')}
              testID="revo-mic"
            >
              <Ionicons name="mic-outline" size={22} color={palette.secondary} />
            </Tap>
          ) : (
            // send, grey until there is a question
            <Tap
              onPress={send}
              disabled={!canSend}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('revo.composer.send')}
              testID="revo-send"
            >
              <Ionicons name="arrow-up-circle" size={30} color={canSend ? palette.primary : palette.secondary} />
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
