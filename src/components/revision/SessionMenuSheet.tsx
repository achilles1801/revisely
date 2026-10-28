import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ActionSheet } from '../v2/ActionSheet';

export interface SessionMenuAction {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  destructive?: boolean;
  onPress: () => void;
}

interface SessionMenuSheetProps {
  visible: boolean;
  actions: SessionMenuAction[];
  onClose: () => void;
}

export function SessionMenuSheet({
  visible,
  actions,
  onClose,
}: SessionMenuSheetProps) {
  return <ActionSheet visible={visible} onClose={onClose} title="Session" actions={actions} testID="session-menu" />;
}
