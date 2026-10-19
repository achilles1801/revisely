import React from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../GlassCard';
import { useTheme } from '../../context/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { shadows } from '../../theme/shadows';

import { MENU_HEIGHT, MENU_WIDTH, menuPosition } from '../../lib/verseMenu';

interface VerseMenuProps {
  /** Screen point of the press; null hides the menu. */
  point: { x: number; y: number } | null;
  onPlay: () => void;
  /** Under "Play": who recites, and how far. */
  playSubtitle?: string;
  onTranslation: () => void;
  onClose: () => void;
}

/**
 * The menu that opens on a held verse: Play and Translation. A plain overlay on
 * the screen, not a Modal: opening the verse sheet (a Modal) while a Modal is
 * still dismissing fails on iOS. Render it last in a full-screen container.
 */
export function VerseMenu({ point, onPlay, playSubtitle, onTranslation, onClose }: VerseMenuProps) {
  const { theme } = useTheme();
  const pos = point ? menuPosition(point, Dimensions.get('window')) : { left: 0, top: 0 };

  const Row = ({
    icon,
    title,
    subtitle,
    onPress,
  }: {
    icon: React.ComponentProps<typeof Ionicons>['name'];
    title: string;
    subtitle?: string;
    onPress: () => void;
  }) => (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.accent + '22' }]}
      accessibilityRole="button"
    >
      <Ionicons name={icon} size={20} color={theme.textPrimary} />
      <View style={{ flex: 1 }}>
        <Text style={[typography.bodyMedium, { color: theme.textPrimary }]}>{title}</Text>
        {subtitle ? (
          <Text style={[typography.caption, { color: theme.textMuted }]}>{subtitle}</Text>
        ) : null}
      </View>
    </Pressable>
  );

  if (!point) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close menu" />
      <View style={[styles.menu, { left: pos.left, top: pos.top }]}>
        <GlassCard elevated style={StyleSheet.absoluteFillObject} />
        <Row icon="play" title="Play" subtitle={playSubtitle ?? 'to the end of the juz'} onPress={onPlay} />
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        <Row icon="language-outline" title="Translation" onPress={onTranslation} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  menu: {
    position: 'absolute',
    width: MENU_WIDTH,
    minHeight: MENU_HEIGHT,
    borderRadius: radius.md,
    overflow: 'hidden',
    ...shadows.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    minHeight: 56,
  },
  divider: { height: StyleSheet.hairlineWidth },
});
