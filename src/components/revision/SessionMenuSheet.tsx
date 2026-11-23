import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ActionSheet } from '../v2/ActionSheet';
import { t } from '../../i18n';

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
  return <ActionSheet visible={visible} onClose={onClose} title={t('revision.menuTitle')} actions={actions} testID="session-menu" />;
}
