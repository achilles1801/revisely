import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import { Backdrop } from '../Backdrop';
import { layoutV2, radiusV2, typeV2 } from '../../theme/v2';
import { Tap } from './Tap';
import { Ionicons } from '@expo/vector-icons';

/** A button in a sheet's header: text ("Cancel", "Save") or an icon (✕, ▶). */
export interface SheetHeaderAction {
  /** Its text, or for an icon its accessibility label. */
  label: string;
  /** Show this icon instead of the text. */
  icon?: keyof typeof Ionicons.glyphMap;
  /** The icon in a round primary button (the sheet's main action). */
  round?: boolean;
  onPress: () => void;
  /** The confirming action: semibold. */
  strong?: boolean;
  disabled?: boolean;
  testID?: string;
}

/**
 * The new design's sheet: slides up over a dimmed backdrop, with a grab handle,
 * a centred 18pt title over a hairline (optionally Cancel and Save on either
 * side), the content, and an optional full-width bar at the foot (Cancel, Done).
 * Every sheet in the new design is one; menus are ActionSheet, built on it.
 *
 * The backdrop is the sheet's sibling, never around it, so content can scroll
 * (CLAUDE.md, UI traps). `onHidden` runs once the sheet is fully gone (iOS:
 * when the modal has been dismissed), for whatever must wait for that.
 */
export function Sheet({
  visible,
  onClose,
  title,
  message,
  left,
  right,
  children,
  footer,
  scroll = false,
  keyboard = false,
  onShow,
  onHidden,
  contentStyle,
  testID,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  message?: string;
  left?: SheetHeaderAction;
  right?: SheetHeaderAction;
  children?: React.ReactNode;
  /** A full-width bar at the bottom (e.g. "Cancel", "Done"). */
  footer?: { label: string; onPress: () => void; testID?: string };
  /** Wrap the content in a scroll view (bounded by the sheet's max height). */
  scroll?: boolean;
  /** Lift the sheet above the keyboard (sheets with a text field). */
  keyboard?: boolean;
  onShow?: () => void;
  onHidden?: () => void;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [shown, setShown] = useState(visible);
  const progress = useRef(new Animated.Value(0)).current;
  const hiddenRef = useRef(onHidden);
  hiddenRef.current = onHidden;
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  useEffect(() => {
    if (visible) {
      setShown(true);
      Animated.timing(progress, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else if (shown) {
      Animated.timing(progress, {
        toValue: 0,
        duration: 180,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        // Reopened before it had gone: the opening animation took over. Any
        // other interruption still closes it, so no invisible sheet is left
        // holding the touches.
        if (!finished && visibleRef.current) return;
        setShown(false);
        if (Platform.OS !== 'ios') hiddenRef.current?.();
      });
    }
    // Only `visible` drives the animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [height * 0.6, 0] });
  const hasHeader = !!(title || left || right);

  const sheet = (
    <View style={styles.bottom} pointerEvents="box-none">
      <Animated.View
        accessibilityViewIsModal
        style={[
          styles.sheet,
          {
            backgroundColor: palette.sheet,
            paddingBottom: Math.max(insets.bottom, layoutV2.gutter),
            maxHeight: height * 0.9,
            transform: [{ translateY }],
          },
        ]}
        testID={testID}
      >
        <View style={[styles.handle, { backgroundColor: palette.handle }]} />
        {hasHeader ? (
          <View style={[styles.header, { borderBottomColor: palette.separator }]}>
            <View style={[styles.side, styles.sideLeft]}>{left ? <HeaderButton action={left} /> : null}</View>
            <View style={styles.titleWrap}>
              {title ? (
                <Text
                  style={[typeV2.sheetTitle, styles.center, { color: palette.text }]}
                  accessibilityRole="header"
                  numberOfLines={2}
                  maxFontSizeMultiplier={1.4}
                >
                  {title}
                </Text>
              ) : null}
              {message ? (
                <Text style={[typeV2.meta, styles.center, styles.message, { color: palette.secondary }]}>{message}</Text>
              ) : null}
            </View>
            <View style={[styles.side, styles.sideRight]}>{right ? <HeaderButton action={right} /> : null}</View>
          </View>
        ) : null}
        {scroll ? (
          <ScrollView bounces={false} style={styles.scroll} contentContainerStyle={contentStyle} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        ) : (
          <View style={contentStyle}>{children}</View>
        )}
        {footer ? (
          <Tap
            onPress={footer.onPress}
            accessibilityRole="button"
            accessibilityLabel={footer.label}
            style={[styles.footer, { backgroundColor: palette.fill }]}
            testID={footer.testID ?? 'sheet-footer'}
          >
            <Text style={[typeV2.button, styles.footerText, { color: palette.text }]}>{footer.label}</Text>
          </Tap>
        ) : null}
      </Animated.View>
    </View>
  );

  return (
    <Modal
      visible={shown}
      transparent
      animationType="none"
      onRequestClose={onClose}
      onShow={onShow}
      onDismiss={() => hiddenRef.current?.()}
    >
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: palette.overlay, opacity: progress }]}>
        <Backdrop onPress={onClose} label="Close" />
      </Animated.View>
      {keyboard ? (
        <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined} pointerEvents="box-none">
          {sheet}
        </KeyboardAvoidingView>
      ) : (
        sheet
      )}
    </Modal>
  );
}

function HeaderButton({ action }: { action: SheetHeaderAction }) {
  const { palette } = useTheme();
  return (
    <Tap
      onPress={action.onPress}
      disabled={action.disabled}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={action.label}
      style={[action.round && [styles.round, { backgroundColor: palette.primary }], action.disabled && { opacity: 0.4 }]}
      testID={action.testID}
    >
      {action.icon ? (
        <Ionicons
          name={action.icon}
          size={action.round ? 18 : 24}
          color={action.round ? palette.onPrimary : palette.text}
          style={action.round && action.icon === 'play' ? styles.playNudge : undefined}
        />
      ) : (
        <Text style={[typeV2.menu, action.strong && styles.strong, { color: palette.text }]} maxFontSizeMultiplier={1.4}>
          {action.label}
        </Text>
      )}
    </Tap>
  );
}

const styles = StyleSheet.create({
  round: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  // The play triangle looks centred a point to the right.
  playNudge: { marginLeft: 2 },
  fill: { flex: 1 },
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: layoutV2.hairline,
    marginBottom: 6,
  },
  side: { width: 72, flexDirection: 'row' },
  sideLeft: { justifyContent: 'flex-start' },
  sideRight: { justifyContent: 'flex-end' },
  titleWrap: { flex: 1 },
  center: { textAlign: 'center' },
  message: { marginTop: 4 },
  strong: { fontWeight: '600' },
  scroll: { flexGrow: 0 },
  footer: { borderRadius: radiusV2.cancel, paddingVertical: 15, marginTop: 12, alignItems: 'center' },
  footerText: { fontSize: 16 },
});
