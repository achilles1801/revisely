import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';

/** A settings row's icon: a plain 24pt glyph in ink, 8pt before the label. */
export function SettingIcon({
  name,
}: {
  name: keyof typeof Ionicons.glyphMap;
}) {
  const { palette } = useTheme();
  return <Ionicons name={name} size={24} color={palette.text} style={{ marginRight: 8 }} />;
}
