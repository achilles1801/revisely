// The iOS-style long-press menu (design d10a): a preview of the held item, a menu card of its
// actions below it, over a dimmed backdrop. Touching the backdrop closes it. An action runs after
// the menu has closed. No blur: the app has no blur module, so the backdrop is the overlay token.

import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { Tap } from './Tap';
import { layoutV2, typeV2 } from '../../theme/v2';

export interface ContextMenuAction {
  key: string;
  label: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  destructive?: boolean;
  onPress: () => void;
}

export interface ContextMenuPreview {
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  /** "Note · 9:40 PM", or the block's name. */
  label: string;
  /** The item's text, when it has one. */
  text?: string;
}

export function ContextMenu({
  visible,
  onClose,
  preview,
  actions,
  testID,
}: {
  visible: boolean;
  onClose: () => void;
  preview?: ContextMenuPreview;
  actions: ContextMenuAction[];
  testID?: string;
}) {
  const { palette } = useTheme();
  const run = (action: ContextMenuAction) => {
    onClose();
    action.onPress();
  };

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable
        style={[StyleSheet.absoluteFill, { backgroundColor: palette.overlay }]}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close menu"
      />
      <View style={styles.column} pointerEvents="box-none" testID={testID}>
        {preview ? (
          <View style={[styles.preview, { backgroundColor: palette.sheet }]}>
            <View style={styles.previewHead}>
              {preview.icon ? <Ionicons name={preview.icon} size={18} color={palette.secondary} /> : null}
              <Text style={[typeV2.meta, { color: palette.secondary, flex: 1 }]} numberOfLines={1}>
                {preview.label}
              </Text>
            </View>
            {preview.text ? (
              <Text style={[typeV2.body, { color: palette.text, marginTop: 6 }]} numberOfLines={6}>
                {preview.text}
              </Text>
            ) : null}
          </View>
        ) : null}

        <View style={[styles.menu, { backgroundColor: palette.sheet }]}>
          {actions.map((a, i) => (
            <React.Fragment key={a.key}>
              {i > 0 ? <View style={[styles.divider, { backgroundColor: palette.separator }]} /> : null}
              <Tap
                onPress={() => run(a)}
                accessibilityRole="button"
                accessibilityLabel={a.label}
                style={styles.row}
                testID={`context-menu-${a.key}`}
              >
                <Text style={[typeV2.body, { color: a.destructive ? palette.red : palette.text, flex: 1 }]}>{a.label}</Text>
                {a.icon ? <Ionicons name={a.icon} size={20} color={a.destructive ? palette.red : palette.text} /> : null}
              </Tap>
            </React.Fragment>
          ))}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  column: { flex: 1, justifyContent: 'center', paddingHorizontal: layoutV2.gutter, gap: 8 },
  preview: { borderRadius: 16, padding: 14 },
  previewHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  menu: { alignSelf: 'flex-start', minWidth: 220, maxWidth: '75%', borderRadius: 16, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 16, minHeight: 48, paddingVertical: 12 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 16 },
});
