import React, { useEffect, useRef } from 'react';
import { plainText } from '../../lib/passages';
import { Animated, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useReduceMotion } from '../../design/motion';
import { Tap } from '../v2/Tap';
import { RevoMark } from './RevoMark';

/** Revo's header: the "Revo" capsule, then History and Memory. */
export function RevoHeader({ onHistory, onMemory }: { onHistory: () => void; onMemory: () => void }) {
  const { palette } = useTheme();
  return (
    <View style={styles.header}>
      <View style={[styles.capsule, { backgroundColor: palette.bubble }]} accessibilityRole="header" accessibilityLabel="Revo">
        <RevoMark size={28} />
        <Text style={[styles.capsuleText, { color: palette.text }]} maxFontSizeMultiplier={1.3}>
          Revo
        </Text>
      </View>
      <View style={styles.headerRight}>
        <Tap onPress={onHistory} hitSlop={10} accessibilityRole="button" accessibilityLabel="History" testID="revo-history">
          <Ionicons name="time-outline" size={22} color={palette.text} />
        </Tap>
        <Tap onPress={onMemory} hitSlop={10} style={styles.memory} accessibilityRole="button" accessibilityLabel="Memory" testID="revo-memory">
          <Text style={[styles.memoryText, { color: palette.text }]} maxFontSizeMultiplier={1.3}>
            Memory
          </Text>
          <Ionicons name="bulb-outline" size={21} color={palette.text} />
        </Tap>
      </View>
    </View>
  );
}

/** A sub-page's header: ‹, the title, and an optional action on the right. */
export function RevoSubHeader({
  title,
  onBack,
  right,
}: {
  title: string;
  onBack: () => void;
  right?: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; testID?: string };
}) {
  const { palette } = useTheme();
  return (
    <View style={styles.subHeader}>
      <Tap onPress={onBack} hitSlop={10} style={styles.side} accessibilityRole="button" accessibilityLabel="Back" testID="revo-back">
        <Ionicons name="chevron-back" size={26} color={palette.text} />
      </Tap>
      <Text style={[styles.subTitle, { color: palette.text }]} accessibilityRole="header" maxFontSizeMultiplier={1.3}>
        {title}
      </Text>
      <View style={[styles.side, styles.sideRight]}>
        {right ? (
          <Tap onPress={right.onPress} hitSlop={10} accessibilityRole="button" accessibilityLabel={right.label} testID={right.testID}>
            <Ionicons name={right.icon} size={24} color={palette.text} />
          </Tap>
        ) : null}
      </View>
    </View>
  );
}

/** Revo's own words: plain text, no bubble. The greeting is larger. */
export function RevoText({ text, greeting = false, testID }: { text: string; greeting?: boolean; testID?: string }) {
  const { palette } = useTheme();
  return (
    <Text style={[greeting ? styles.greeting : styles.answer, { color: palette.text }]} selectable testID={testID}>
      {text}
    </Text>
  );
}

/** Copy, thumbs up and thumbs down under an answer. */
export function FeedbackRow({
  feedback,
  onCopy,
  onFeedback,
  testID,
}: {
  feedback?: 'up' | 'down' | null;
  onCopy: () => void;
  onFeedback?: (f: 'up' | 'down' | null) => void;
  testID?: string;
}) {
  const { palette } = useTheme();
  const thumb = (which: 'up' | 'down') => {
    const on = feedback === which;
    return (
      <Tap
        onPress={() => onFeedback?.(on ? null : which)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={which === 'up' ? 'Good answer' : 'Bad answer'}
        accessibilityState={{ selected: on }}
        testID={testID ? `${testID}-${which}` : undefined}
      >
        <Ionicons
          name={which === 'up' ? (on ? 'thumbs-up' : 'thumbs-up-outline') : on ? 'thumbs-down' : 'thumbs-down-outline'}
          size={19}
          color={on ? palette.text : palette.secondary}
        />
      </Tap>
    );
  };
  return (
    <View style={styles.feedback}>
      <Tap onPress={onCopy} hitSlop={8} accessibilityRole="button" accessibilityLabel="Copy" testID={testID ? `${testID}-copy` : undefined}>
        <Ionicons name="copy-outline" size={19} color={palette.secondary} />
      </Tap>
      {onFeedback ? thumb('up') : null}
      {onFeedback ? thumb('down') : null}
    </View>
  );
}

/** What the user asked: a primary bubble on the right, with what they added above it. */
export function UserBubble({ text, attached = [], testID }: { text: string; attached?: { kind: string; label: string }[]; testID?: string }) {
  const { palette } = useTheme();
  return (
    <View style={styles.userWrap}>
      {attached.length > 0 ? (
        <View style={styles.bubbleChips}>
          {attached.map((a, i) => (
            <ContextChip key={i} label={a.label} kind={a.kind} />
          ))}
        </View>
      ) : null}
      <View style={[styles.userBubble, { backgroundColor: palette.primary }]} testID={testID}>
        <Text style={[styles.userText, { color: palette.onPrimary }]}>{text}</Text>
      </View>
    </View>
  );
}

export const ATTACH_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  revisionDay: 'calendar-outline',
  surah: 'book-outline',
  juz: 'albums-outline',
  pages: 'document-outline',
  // Kinds older apps sent, still shown in their conversations.
  day: 'calendar-outline',
  page: 'book-outline',
  note: 'document-text-outline',
  recording: 'mic-outline',
  insight: 'stats-chart-outline',
};

/** An attached context, as a chip: `accentSubtle`, 30 tall, with × when it can be removed. */
export function ContextChip({ label, kind, onRemove }: { label: string; kind: string; onRemove?: () => void }) {
  const { palette } = useTheme();
  return (
    <View style={[styles.contextChip, { backgroundColor: palette.accentSubtle }]} testID="revo-context-chip">
      <Ionicons name={ATTACH_ICON[kind] ?? 'attach-outline'} size={15} color={palette.accentText} />
      <Text style={[styles.contextText, { color: palette.accentText }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
      {onRemove ? (
        <Tap onPress={onRemove} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Remove ${label}`} testID="revo-context-remove">
          <Ionicons name="close-circle" size={18} color={palette.accentText} />
        </Tap>
      ) : null}
    </View>
  );
}

/** Suggestions: 36 tall pills that scroll sideways; a tap asks it. */
export function Chips({ chips, onPick, disabled }: { chips: string[]; onPick: (c: string) => void; disabled?: boolean }) {
  const { palette } = useTheme();
  if (chips.length === 0) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
      {chips.map((c) => (
        <Tap
          key={c}
          onPress={() => onPick(c)}
          disabled={disabled}
          style={[styles.chip, { borderColor: palette.outline }, disabled && styles.dim]}
          accessibilityRole="button"
          accessibilityLabel={`Ask: ${c}`}
          testID={`revo-chip-${plainText(c)}`}
        >
          <Text style={[styles.chipText, { color: palette.text }]} maxFontSizeMultiplier={1.3}>
            {c}
          </Text>
        </Tap>
      ))}
    </ScrollView>
  );
}

/** The day's questions are used (or the month's budget): when Revo is back. */
export function LimitCard({ title, body }: { title: string; body: string }) {
  const { palette } = useTheme();
  return (
    <View style={[styles.limit, { backgroundColor: palette.bubble }]} accessibilityRole="summary" testID="revo-limit">
      <View style={styles.limitHead}>
        <Ionicons name="hourglass-outline" size={22} color={palette.text} />
        <Text style={[styles.limitTitle, { color: palette.text }]} maxFontSizeMultiplier={1.3}>
          {title}
        </Text>
      </View>
      <Text style={[styles.limitBody, { color: palette.secondary }]} maxFontSizeMultiplier={1.4}>
        {body}
      </Text>
    </View>
  );
}

/** Revo is thinking: three dots that pulse (still with Reduce Motion). */
export function Typing() {
  const { palette } = useTheme();
  const reduceMotion = useReduceMotion();
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [pulse, reduceMotion]);
  return (
    <View style={styles.typing} accessibilityLabel="Revo is thinking" accessible testID="revo-typing">
      {[0, 1, 2].map((i) => (
        <Animated.View
          key={i}
          style={[
            styles.typingDot,
            { backgroundColor: palette.secondary },
            !reduceMotion && {
              opacity: pulse.interpolate({ inputRange: [0, (i + 1) / 4, 1], outputRange: [0.3, 1, 0.3] }),
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bubbleChips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 6 },
  header: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  capsule: { height: 36, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 4, paddingRight: 14 },
  capsuleText: { fontSize: 15, fontWeight: '600' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 22 },
  memory: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  memoryText: { fontSize: 15, fontWeight: '600' },
  subHeader: { height: 44, flexDirection: 'row', alignItems: 'center' },
  side: { width: 44, justifyContent: 'center' },
  sideRight: { alignItems: 'flex-end' },
  subTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '600' },
  greeting: { fontSize: 19, lineHeight: 27 },
  answer: { fontSize: 17, lineHeight: 24 },
  feedback: { flexDirection: 'row', alignItems: 'center', gap: 22, marginTop: 14 },
  userWrap: { alignItems: 'flex-end', gap: 6 },
  userBubble: {
    maxWidth: 270,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomRightRadius: 4,
    borderBottomLeftRadius: 18,
  },
  userText: { fontSize: 16, lineHeight: 21 },
  contextChip: { height: 30, borderRadius: 15, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, alignSelf: 'flex-start', maxWidth: 300 },
  contextText: { fontSize: 14, fontWeight: '600', flexShrink: 1 },
  chips: { gap: 8, paddingRight: 16 },
  chip: { height: 36, borderRadius: 18, borderWidth: 1, paddingHorizontal: 14, justifyContent: 'center' },
  chipText: { fontSize: 15, fontWeight: '600' },
  dim: { opacity: 0.45 },
  limit: { borderRadius: 16, padding: 16, gap: 6 },
  limitHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  limitTitle: { fontSize: 17, fontWeight: '600', flexShrink: 1 },
  limitBody: { fontSize: 15, lineHeight: 21 },
  typing: { flexDirection: 'row', gap: 6, paddingVertical: 10 },
  typingDot: { width: 7, height: 7, borderRadius: 3.5 },
});
