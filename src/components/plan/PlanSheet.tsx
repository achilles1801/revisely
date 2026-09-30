import React, { forwardRef, useCallback } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  BottomSheetBackdrop,
  BottomSheetBackdropProps,
  BottomSheetBackgroundProps,
  BottomSheetModal,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassCard } from '../GlassCard';
import { useTheme } from '../../context/ThemeContext';
import { spacing } from '../../theme/spacing';

/**
 * Themed @gorhom sheet with an iOS-style header: [Cancel]  Title  [Done].
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
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.35}
        pressBehavior="close"
      />
    ),
    [],
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
      enableDynamicSizing={dynamic}
      stackBehavior={stackBehavior}
      onDismiss={onDismiss}
      onChange={(index: number) => {
        if (index >= 0) onPresented?.();
      }}
      backdropComponent={renderBackdrop}
      backgroundComponent={SheetGlassBackground}
      handleIndicatorStyle={{ backgroundColor: theme.textMuted, opacity: 0.4, width: 36 }}
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

/** Glass sheet surface, matching the app's GlassCard look over the gradient. */
function SheetGlassBackground({ style }: BottomSheetBackgroundProps) {
  return (
    <View style={[style, styles.background]} pointerEvents="none">
      <GlassCard style={StyleSheet.absoluteFillObject} />
    </View>
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
  const { theme } = useTheme();
  return (
    <View style={styles.header}>
      <View style={[styles.side, styles.sideLeft]}>
        {leftLabel && onLeft ? (
          <HeaderButton label={leftLabel} onPress={onLeft} color={theme.accent} />
        ) : null}
      </View>
      <Text
        style={[styles.title, { color: theme.textPrimary }]}
        numberOfLines={1}
        accessibilityRole="header"
      >
        {title}
      </Text>
      <View style={[styles.side, styles.sideRight]}>
        {rightLoading ? (
          <ActivityIndicator size="small" color={theme.accent} />
        ) : rightLabel && onRight ? (
          <HeaderButton
            label={rightLabel}
            onPress={onRight}
            color={rightDisabled ? theme.textMuted : theme.accent}
            disabled={rightDisabled}
            bold
          />
        ) : null}
      </View>
    </View>
  );
}

function HeaderButton({
  label,
  onPress,
  color,
  disabled,
  bold,
}: {
  label: string;
  onPress: () => void;
  color: string;
  disabled?: boolean;
  bold?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
    >
      {({ pressed }) => (
        <Text
          style={[
            styles.headerButton,
            { color, fontWeight: bold ? '600' : '400', opacity: pressed ? 0.5 : 1 },
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  background: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
  },
  side: {
    width: 88,
    justifyContent: 'center',
  },
  sideLeft: { alignItems: 'flex-start' },
  sideRight: { alignItems: 'flex-end' },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600',
  },
  headerButton: {
    fontSize: 17,
    lineHeight: 22,
  },
});
