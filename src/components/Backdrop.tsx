import React from 'react';
import { Pressable, StyleSheet } from 'react-native';

/**
 * The dimmed area behind a sheet or card in a Modal: a tap on it closes it.
 *
 * Render it as the sheet's sibling, before it, never around it. On iOS (the new
 * architecture) a scroll view doesn't scroll while a view above it holds the
 * touch, and a Pressable takes every touch that starts inside it: a sheet wrapped
 * in one can't scroll its text, however its height is bounded.
 */
export function Backdrop({ onPress, label }: { onPress: () => void; label: string }) {
  return (
    <Pressable
      style={StyleSheet.absoluteFill}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID="backdrop"
    />
  );
}
