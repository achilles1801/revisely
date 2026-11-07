import React, { useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import type { RevoAttachment } from '../../lib/revo/types';
import { Tap } from '../v2/Tap';
import { ContextChip } from './RevoParts';

export type PickKind = 'day' | 'page' | 'recording';

const ROWS: { kind: PickKind; title: string; line: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { kind: 'day', title: 'A day', line: 'What was planned and done, with its notes', icon: 'calendar-outline' },
  { kind: 'page', title: 'A surah, juz or page', line: 'How often it was revised, its weak spots', icon: 'book-outline' },
  { kind: 'recording', title: 'A recording', line: 'Length and pages, never the audio', icon: 'mic-outline' },
];

export const QUESTION_MAX = 600;

/**
 * Where the user asks: + (what to add to the question), the field ("Ask Revo anything", with
 * the mic for dictation), and what's attached as a chip above it. Off (`disabled`) when the
 * day's questions are used: 45% and the placeholder says when Revo is back.
 */
export function RevoComposer({
  onSend,
  onPick,
  attach,
  onRemoveAttach,
  disabled,
  disabledText,
  busy,
  onFocus,
}: {
  onSend: (text: string) => void;
  onPick: (kind: PickKind) => void;
  attach: RevoAttachment | null;
  onRemoveAttach: () => void;
  disabled: boolean;
  disabledText: string;
  busy: boolean;
  onFocus?: () => void;
}) {
  const { palette, isDark } = useTheme();
  const [text, setText] = useState('');
  const [menu, setMenu] = useState(false);
  const input = useRef<TextInput>(null);
  const canSend = !disabled && !busy && text.trim().length > 0;
  const send = () => {
    if (!canSend) return;
    onSend(text.trim());
    setText('');
  };
  return (
    <View style={[styles.wrap, disabled && styles.off]}>
      {menu ? (
        <View style={[styles.menu, { backgroundColor: palette.sheet, borderColor: palette.separator, shadowColor: palette.shadow }]} testID="revo-plus-menu">
          <Text style={[styles.menuTitle, { color: palette.secondary }]} maxFontSizeMultiplier={1.3}>
            Add to your question
          </Text>
          {ROWS.map((r, i) => (
            <Tap
              key={r.kind}
              onPress={() => {
                setMenu(false);
                onPick(r.kind);
              }}
              style={[styles.menuRow, i > 0 && { borderTopColor: palette.separator, borderTopWidth: StyleSheet.hairlineWidth }]}
              accessibilityRole="button"
              accessibilityLabel={`${r.title}. ${r.line}`}
              testID={`revo-add-${r.kind}`}
            >
              <View style={styles.menuText}>
                <Text style={[styles.menuRowTitle, { color: palette.text }]} maxFontSizeMultiplier={1.3}>
                  {r.title}
                </Text>
                <Text style={[styles.menuRowLine, { color: palette.secondary }]} maxFontSizeMultiplier={1.3}>
                  {r.line}
                </Text>
              </View>
              <Ionicons name={r.icon} size={22} color={palette.text} />
            </Tap>
          ))}
        </View>
      ) : null}
      {attach ? <ContextChip label={attach.label} kind={attach.kind} onRemove={onRemoveAttach} /> : null}
      <View style={styles.row}>
        <Tap
          onPress={() => setMenu((m) => !m)}
          disabled={disabled}
          style={[styles.plus, { backgroundColor: palette.bubble }]}
          accessibilityRole="button"
          accessibilityLabel="Add to your question"
          accessibilityState={{ expanded: menu, disabled }}
          testID="revo-plus"
        >
          <Ionicons name={menu ? 'close' : 'add'} size={26} color={palette.text} />
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
            onFocus={() => {
              setMenu(false);
              onFocus?.();
            }}
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
  menu: {
    width: 280,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 6,
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  menuTitle: { fontSize: 14, paddingHorizontal: 16, paddingVertical: 8 },
  menuRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 12 },
  menuText: { flex: 1 },
  menuRowTitle: { fontSize: 17 },
  menuRowLine: { fontSize: 13, lineHeight: 17, marginTop: 1 },
});
