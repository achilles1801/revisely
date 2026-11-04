// react-native's Modal for scenarios: its children while visible, and, as on
// iOS, onShow when it appears and onDismiss once it has gone. React Native's own
// jest mock never calls onDismiss, and v2/Sheet runs a menu's action from it.
import React, { useEffect, useRef } from 'react';
import { View } from 'react-native';

interface Props {
  visible?: boolean;
  onShow?: () => void;
  onDismiss?: () => void;
  children?: React.ReactNode;
  testID?: string;
}

function Modal({ visible = true, onShow, onDismiss, children, testID }: Props) {
  const was = useRef(false);
  const show = useRef(onShow);
  show.current = onShow;
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  useEffect(() => {
    if (visible && !was.current) show.current?.();
    if (!visible && was.current) setTimeout(() => dismiss.current?.(), 0);
    was.current = visible;
  }, [visible]);
  return visible ? <View testID={testID}>{children}</View> : null;
}

module.exports = { __esModule: true, default: Modal };
