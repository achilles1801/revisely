import React from 'react';
import { Platform, Switch } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { useDesign } from '../../design/DesignContext';
import { Toggle } from '../v2/TopBar';

/** A settings switch: ink when on in the new design, jade in the classic one. */
export function SettingSwitch(props: {
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const { theme } = useTheme();
  const { isNew } = useDesign();
  if (isNew) return <Toggle {...props} />;
  return (
    <Switch
      {...props}
      trackColor={{ false: theme.border, true: theme.accent }}
      thumbColor={Platform.OS === 'android' ? theme.bg : undefined}
    />
  );
}
