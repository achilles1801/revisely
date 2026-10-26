import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { Backdrop } from '../Backdrop';
import { layoutV2, radiusV2, typeV2 } from '../../theme/v2';
import { Tap } from './Tap';

type IconName = keyof typeof Ionicons.glyphMap;

export interface SheetAction {
  key: string;
  label: string;
  icon?: IconName;
  destructive?: boolean;
  /** Shown with a check (a choice in a list). */
  selected?: boolean;
  /** Secondary text at the end of the row. */
  detail?: string;
  disabled?: boolean;
  onPress: () => void;
}

/**
 * The new design's menu: a sheet from the bottom with a grab handle, a title,
 * a list of actions (icon and label, destructive ones in red) and a Cancel bar.
 * Every ⋯ in the new design opens one.
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
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [shown, setShown] = useState(visible);
  const progress = useRef(new Animated.Value(0)).current;
  const pending = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (visible) {
      setShown(true);
      Animated.timing(progress, {
        toValue: 1,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else if (shown) {
      Animated.timing(progress, {
        toValue: 0,
        duration: 180,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        setShown(false);
        // iOS runs it from onDismiss, once the modal is really gone.
        if (Platform.OS !== 'ios') runPending();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const runPending = () => {
    const fn = pending.current;
    pending.current = null;
    fn?.();
  };

  const choose = (action: SheetAction) => {
    pending.current = action.onPress;
    onClose();
  };

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [height * 0.6, 0] });

  return (
    <Modal visible={shown} transparent animationType="none" onRequestClose={onClose} onDismiss={runPending}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: palette.overlay, opacity: progress }]}>
        <Backdrop onPress={onClose} label="Close" />
      </Animated.View>
      <View style={styles.bottom} pointerEvents="box-none">
        <Animated.View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {
              backgroundColor: palette.sheet,
              paddingBottom: Math.max(insets.bottom, layoutV2.gutter),
              maxHeight: height * 0.85,
              transform: [{ translateY }],
            },
          ]}
          testID={testID}
        >
          <View style={[styles.handle, { backgroundColor: palette.handle }]} />
          {title ? (
            <View style={[styles.titleWrap, { borderBottomColor: palette.separator }]}>
              <Text style={[typeV2.sheetTitle, styles.center, { color: palette.text }]} accessibilityRole="header">
                {title}
              </Text>
              {message ? (
                <Text style={[typeV2.meta, styles.center, styles.message, { color: palette.secondary }]}>{message}</Text>
              ) : null}
            </View>
          ) : null}
          <ScrollView bounces={false} style={styles.list} contentContainerStyle={styles.listContent}>
            {children}
            {actions.map((a) => {
              const color = a.destructive ? palette.red : palette.text;
              return (
                <Tap
                  key={a.key}
                  onPress={() => choose(a)}
                  disabled={a.disabled}
                  accessibilityRole="button"
                  accessibilityLabel={a.detail ? `${a.label}, ${a.detail}` : a.label}
                  accessibilityState={{ selected: a.selected, disabled: a.disabled }}
                  style={[styles.item, a.disabled && { opacity: 0.4 }]}
                  testID={`sheet-action-${a.key}`}
                >
                  {a.icon ? <Ionicons name={a.icon} size={24} color={color} style={styles.icon} /> : null}
                  <Text style={[typeV2.menu, styles.label, { color }]}>{a.label}</Text>
                  {a.detail ? <Text style={[typeV2.meta, { color: palette.secondary }]}>{a.detail}</Text> : null}
                  {a.selected ? <Ionicons name="checkmark" size={20} color={palette.text} style={styles.check} /> : null}
                </Tap>
              );
            })}
          </ScrollView>
          <Tap
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={cancelLabel}
            style={[styles.cancel, { backgroundColor: palette.fill }]}
            testID="sheet-cancel"
          >
            <Text style={[typeV2.button, styles.cancelText, { color: palette.text }]}>{cancelLabel}</Text>
          </Tap>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bottom: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radiusV2.sheet,
    borderTopRightRadius: radiusV2.sheet,
    paddingHorizontal: layoutV2.gutter,
  },
  handle: {
    width: layoutV2.handle.width,
    height: layoutV2.handle.height,
    borderRadius: layoutV2.handle.height / 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 6,
  },
  titleWrap: { paddingVertical: 12, borderBottomWidth: layoutV2.hairline, marginBottom: 6 },
  center: { textAlign: 'center' },
  message: { marginTop: 4 },
  list: { flexGrow: 0 },
  listContent: { paddingVertical: 2 },
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
  cancel: { borderRadius: radiusV2.cancel, paddingVertical: 15, marginTop: 12, alignItems: 'center' },
  cancelText: { fontSize: 16 },
});
