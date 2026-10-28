import React, { useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { radiusV2, typeV2 } from '../../theme/v2';
import { Sheet } from './Sheet';
import { Tap } from './Tap';

type IconName = keyof typeof Ionicons.glyphMap;

export interface SheetAction {
  key: string;
  label: string;
  icon?: IconName;
  /** A second line under the label. */
  subtitle?: string;
  destructive?: boolean;
  /** Shown with a check (a choice in a list). */
  selected?: boolean;
  /** Secondary text at the end of the row. */
  detail?: string;
  disabled?: boolean;
  /** Starts a group: a small header above this row. */
  section?: string;
  onPress: () => void;
}

/**
 * The new design's menu: a sheet with a grab handle, a title, a list of
 * actions (icon and label, destructive ones in red) and a Cancel bar. Every ⋯
 * in the new design opens one.
 *
 * An action runs once the sheet has gone, so it can open an alert or another
 * sheet (iOS can't present one modal while another is being dismissed).
 */
export function ActionSheet({
  visible,
  onClose,
  title,
  message,
  actions = [],
  cancelLabel = 'Cancel',
  children,
  testID,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  message?: string;
  actions?: SheetAction[];
  cancelLabel?: string;
  /** Custom content between the title and the actions. */
  children?: React.ReactNode;
  testID?: string;
}) {
  const { palette } = useTheme();
  const pending = useRef<(() => void) | null>(null);

  const runPending = () => {
    const fn = pending.current;
    pending.current = null;
    fn?.();
  };

  const choose = (action: SheetAction) => {
    pending.current = action.onPress;
    onClose();
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title}
      message={message}
      scroll
      footer={{ label: cancelLabel, onPress: onClose, testID: 'sheet-cancel' }}
      onHidden={runPending}
      contentStyle={styles.listContent}
      testID={testID}
    >
      {children}
      {actions.map((a) => {
        const color = a.destructive ? palette.red : palette.text;
        return (
          <View key={a.key}>
            {a.section ? (
              <Text style={[typeV2.meta, styles.section, { color: palette.secondary }]} accessibilityRole="header">
                {a.section}
              </Text>
            ) : null}
            <Tap
              onPress={() => choose(a)}
              disabled={a.disabled}
              accessibilityRole="button"
              accessibilityLabel={[a.label, a.subtitle, a.detail].filter(Boolean).join(', ')}
              accessibilityState={{ selected: a.selected, disabled: a.disabled }}
              style={[styles.item, a.disabled && { opacity: 0.4 }]}
              testID={`sheet-action-${a.key}`}
            >
              {a.icon ? <Ionicons name={a.icon} size={24} color={color} style={styles.icon} /> : null}
              <View style={styles.label}>
                <Text style={[typeV2.menu, { color }]}>{a.label}</Text>
                {a.subtitle ? <Text style={[typeV2.meta, { color: palette.secondary }]}>{a.subtitle}</Text> : null}
              </View>
              {a.detail ? <Text style={[typeV2.meta, { color: palette.secondary }]}>{a.detail}</Text> : null}
              {a.selected ? <Ionicons name="checkmark" size={20} color={palette.text} style={styles.check} /> : null}
            </Tap>
          </View>
        );
      })}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  listContent: { paddingVertical: 2 },
  section: { paddingHorizontal: 8, paddingTop: 12, paddingBottom: 2 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: radiusV2.media,
  },
  icon: { marginRight: 16 },
  label: { flex: 1 },
  check: { marginLeft: 8 },
});
