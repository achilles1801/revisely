import React, { forwardRef, useCallback } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import {
  BottomSheetBackdrop,
  BottomSheetBackdropProps,
  BottomSheetBackgroundProps,
  BottomSheetModal,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Tap } from '../v2/Tap';
import { layoutV2, radiusV2, typeV2 } from '../../theme/v2';
import { useTheme } from '../../context/ThemeContext';
import { spacing } from '../../theme/spacing';

/**
 * Themed @gorhom sheet with an iOS-style header: [Cancel]  Title  [Done].
 *
 * It takes v2/Sheet's frame: a solid sheet with 20pt corners, the v2 grab
 * handle and backdrop, an 18pt centred title over a hairline, Cancel and the
 * confirming action in ink.
 *
 * - Without `snapPoints` the sheet sizes itself to its content (wrapped in a
 *   BottomSheetView). Use for short forms.
 * - With `snapPoints` the children are rendered as-is under the header; pass a
 *   BottomSheetScrollView / BottomSheetFlatList (flex: 1) for scrolling content.
 */
export interface PlanSheetProps {
  title: string;
  leftLabel?: string;
  onLeft?: () => void;
  rightLabel?: string;
  onRight?: () => void;
  rightDisabled?: boolean;
  rightLoading?: boolean;
  snapPoints?: (string | number)[];
  stackBehavior?: 'push' | 'switch' | 'replace';
  onDismiss?: () => void;
  /** Called once the sheet has animated open. */
  onPresented?: () => void;
  children: React.ReactNode;
}

export const PlanSheet = forwardRef<BottomSheetModal, PlanSheetProps>(function PlanSheet(
  {
    title,
    leftLabel,
    onLeft,
    rightLabel,
    onRight,
    rightDisabled,
    rightLoading,
    snapPoints,
    stackBehavior,
    onDismiss,
    onPresented,
    children,
  },
  ref,
) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        // The overlay is a colour with its own alpha: shown whole.
        style={[props.style, { backgroundColor: palette.overlay }]}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={1}
        pressBehavior="close"
      />
    ),
    [palette.overlay],
  );

  const header = (
    <SheetHeader
      title={title}
      leftLabel={leftLabel}
      onLeft={onLeft}
      rightLabel={rightLabel}
      onRight={onRight}
      rightDisabled={rightDisabled}
      rightLoading={rightLoading}
    />
  );

  const dynamic = !snapPoints;

  return (
    <BottomSheetModal
      ref={ref}
      snapPoints={snapPoints}
      handleStyle={styles.handleV2}
      enableDynamicSizing={dynamic}
      stackBehavior={stackBehavior}
      onDismiss={onDismiss}
      onChange={(index: number) => {
        if (index >= 0) onPresented?.();
      }}
      backdropComponent={renderBackdrop}
      backgroundComponent={SheetSolidBackground}
      handleIndicatorStyle={{
        backgroundColor: palette.handle,
        width: layoutV2.handle.width,
        height: layoutV2.handle.height,
        borderRadius: layoutV2.handle.height / 2,
      }}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      topInset={insets.top}
    >
      {dynamic ? (
        <BottomSheetView style={{ paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.sm }}>
          {header}
          {children}
        </BottomSheetView>
      ) : (
        <View style={styles.fill}>
          {header}
          {children}
        </View>
      )}
    </BottomSheetModal>
  );
});

/** The sheet: solid, 20pt corners. */
function SheetSolidBackground({ style }: BottomSheetBackgroundProps) {
  const { palette } = useTheme();
  return (
    <View
      style={[style, styles.background, { backgroundColor: palette.sheet }]}
      pointerEvents="none"
      testID="plan-sheet-background"
    />
  );
}

export function SheetHeader({
  title,
  leftLabel,
  onLeft,
  rightLabel,
  onRight,
  rightDisabled,
  rightLoading,
}: Pick<
  PlanSheetProps,
  'title' | 'leftLabel' | 'onLeft' | 'rightLabel' | 'onRight' | 'rightDisabled' | 'rightLoading'
>) {
  const { palette } = useTheme();
  // v2/Sheet's header.
  return (
    <View style={[styles.headerV2, { borderBottomColor: palette.separator }]}>
      <View style={[styles.sideV2, styles.sideLeftV2]}>
        {leftLabel && onLeft ? <HeaderButtonV2 label={leftLabel} onPress={onLeft} /> : null}
      </View>
      <Text
        style={[typeV2.sheetTitle, styles.titleV2, { color: palette.text }]}
        numberOfLines={2}
        accessibilityRole="header"
        maxFontSizeMultiplier={1.4}
      >
        {title}
      </Text>
      <View style={[styles.sideV2, styles.sideRightV2]}>
        {rightLoading ? (
          <ActivityIndicator size="small" color={palette.secondary} />
        ) : rightLabel && onRight ? (
          <HeaderButtonV2 label={rightLabel} onPress={onRight} disabled={rightDisabled} strong />
        ) : null}
      </View>
    </View>
  );
}

/** v2/Sheet's header button: ink, semibold when it confirms, faded when it can't. */
function HeaderButtonV2({
  label,
  onPress,
  disabled,
  strong,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  strong?: boolean;
}) {
  const { palette } = useTheme();
  return (
    <Tap
      onPress={onPress}
      disabled={disabled}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={disabled && styles.disabled}
    >
      <Text
        style={[typeV2.menu, strong && styles.strong, { color: palette.text }]}
        numberOfLines={1}
        maxFontSizeMultiplier={1.4}
      >
        {label}
      </Text>
    </Tap>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  background: {
    borderTopLeftRadius: radiusV2.sheet,
    borderTopRightRadius: radiusV2.sheet,
    overflow: 'hidden',
  },
  handleV2: { paddingTop: 10, paddingBottom: 6 },
  headerV2: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: layoutV2.gutter,
    borderBottomWidth: layoutV2.hairline,
    marginBottom: 6,
  },
  sideV2: { width: 72, flexDirection: 'row', alignItems: 'center' },
  sideLeftV2: { justifyContent: 'flex-start' },
  sideRightV2: { justifyContent: 'flex-end' },
  titleV2: { flex: 1, textAlign: 'center' },
  strong: { fontWeight: '600' },
  disabled: { opacity: 0.4 },
});
