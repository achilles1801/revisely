import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';

/** A settings row's icon: a plain 24pt glyph in ink, 8pt before the label. */
export function SettingIcon({
  name,
}: {
  name: keyof typeof Ionicons.glyphMap;
  /** Unused: it styled the classic tinted tile. Optional until the callers drop it. */
  tileStyle?: StyleProp<ViewStyle>;
}) {
  const { palette } = useTheme();
  return <Ionicons name={name} size={24} color={palette.text} style={{ marginRight: 8 }} />;
}
