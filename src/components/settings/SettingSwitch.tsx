import React from 'react';
import { Toggle } from '../v2/TopBar';

/** A settings switch: ink when on. */
export function SettingSwitch(props: {
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}) {
  return <Toggle {...props} />;
}
