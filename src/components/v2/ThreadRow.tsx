import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { layoutV2, markV2, typeV2 } from '../../theme/v2';
import { Tap } from './Tap';

/**
 * One row of a feed, the way a post sits in a thread: a mark on the left, a
 * name with its metadata and a ⋯ menu, the body, then actions.
 *
 *   depth 0 → a top-level row (40pt mark, 16pt vertical padding);
 *   depth 1 → a reply (36pt mark, 12pt).
 *
 * Rows of one thread are joined by a 2pt line through their marks: the row
 * above draws `lineBelow`, the one below `lineAbove`. A hairline separator
 * closes the thread.
 */
export function ThreadRow({
  mark,
  depth = 0,
  name,
  nameAfter,
  meta,
  onMenu,
  menuLabel = 'More',
  lineAbove,
  lineBelow,
  separator = true,
  onPress,
  accessibilityLabel,
  children,
  footer,
  testID,
}: {
  mark: React.ReactNode;
  depth?: 0 | 1;
  name: string;
  /** Beside the name, before the metadata (e.g. the Arabic name). */
  nameAfter?: React.ReactNode;
  meta?: string;
  onMenu?: () => void;
  menuLabel?: string;
  lineAbove?: boolean;
  lineBelow?: boolean;
  separator?: boolean;
  /** The whole row opens something (its inner buttons still work). */
  onPress?: () => void;
  accessibilityLabel?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  testID?: string;
}) {
  const { palette } = useTheme();
  const pad = depth === 0 ? layoutV2.rowPad : layoutV2.nestedPad;
  const line = { width: layoutV2.threadLine, backgroundColor: palette.separator, borderRadius: 1 };

  const body = (
    <>
      <View style={styles.markCol}>
        <View style={{ height: pad, alignItems: 'center' }}>
          {lineAbove ? <View style={[line, styles.lineAbove]} testID="thread-line" /> : null}
        </View>
        {mark}
        {lineBelow ? <View style={[line, styles.lineBelow]} testID="thread-line" /> : null}
      </View>
      <View style={[styles.content, { paddingTop: pad, paddingBottom: pad }]}>
        <View style={styles.header}>
          <Text style={[typeV2.name, styles.name, { color: palette.text }]} numberOfLines={1}>
            {name}
          </Text>
          {nameAfter}
          {meta ? (
            <Text style={[typeV2.meta, styles.meta, { color: palette.secondary }]} numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
          <View style={styles.spacer} />
          {onMenu ? (
            <Tap
              onPress={onMenu}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={menuLabel}
              style={styles.menu}
              testID={testID ? `${testID}-menu` : undefined}
            >
              <Ionicons name="ellipsis-horizontal" size={18} color={palette.secondary} />
            </Tap>
          ) : null}
        </View>
        {children}
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </View>
    </>
  );

  return (
    <View>
      {onPress ? (
        <Tap
          onPress={onPress}
          pressedOpacity={0.7}
          style={styles.row}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          accessibilityActions={onMenu ? [{ name: 'menu', label: menuLabel }] : undefined}
          onAccessibilityAction={(e) => e.nativeEvent.actionName === 'menu' && onMenu?.()}
          testID={testID}
        >
          {body}
        </Tap>
      ) : (
        <View style={styles.row} testID={testID}>
          {body}
        </View>
      )}
      {separator ? <View style={{ height: layoutV2.hairline, backgroundColor: palette.separator }} /> : null}
    </View>
  );
}

/** A thread's body text: the first line in ink, the rest secondary. */
export function RowText({
  children,
  secondary,
  numberOfLines,
  style,
}: {
  children: React.ReactNode;
  secondary?: boolean;
  numberOfLines?: number;
  style?: object;
}) {
  const { palette } = useTheme();
  return (
    <Text
      style={[typeV2.body, { color: secondary ? palette.secondary : palette.text }, style]}
      numberOfLines={numberOfLines}
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', paddingHorizontal: layoutV2.gutter },
  markCol: { width: markV2.top, alignItems: 'center' },
  lineAbove: { flex: 1, marginBottom: 4 },
  lineBelow: { flex: 1, marginTop: 4 },
  content: { flex: 1, marginLeft: layoutV2.markGap, minWidth: 0 },
  header: { flexDirection: 'row', alignItems: 'center', minHeight: 20, marginBottom: 2 },
  name: { flexShrink: 1 },
  meta: { marginLeft: 6, flexShrink: 0 },
  spacer: { flex: 1 },
  menu: { paddingLeft: 8 },
  footer: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 10 },
});
