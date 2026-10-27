import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useDesign } from '../../design/DesignContext';

/**
 * A settings row's icon: in the classic design a jade-tinted tile (the caller's
 * tile style), in the new design a plain 24pt glyph in ink.
 */
export function SettingIcon({
  name,
  tileStyle,
  size = 16,
}: {
  name: keyof typeof Ionicons.glyphMap;
  tileStyle: StyleProp<ViewStyle>;
  /** The glyph size inside the classic tile. */
  size?: number;
}) {
  const { theme, palette } = useTheme();
  const { isNew } = useDesign();
  // The classic rows put 8pt between icon and label; the new design's rows 16.
  if (isNew) return <Ionicons name={name} size={24} color={palette.text} style={{ marginRight: 8 }} />;
  return (
    <View style={[tileStyle, { backgroundColor: theme.accent + '20' }]}>
      <Ionicons name={name} size={size} color={theme.accent} />
    </View>
  );
}
