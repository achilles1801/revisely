import React, { useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { revisionItem } from '../../../lib/activityItems';
import type { RevisionLog } from '../../../types';
import { ActivityItemRow } from '../../activity/ActivityItemRow';
import { ActionSheet } from '../../v2/ActionSheet';

/**
 * A past revision session on Home, the way Activity lists things: what was
 * revised and when, then the pages and surahs. Tap to edit; ⋯ to edit or
 * delete.
 */
export function SessionPost({
  log,
  today,
  onEdit,
  onDelete,
  separator = true,
}: {
  log: RevisionLog;
  /** Today's revision day, for "2d". */
  today: string;
  onEdit: () => void;
  onDelete: () => void;
  separator?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const item = useMemo(() => revisionItem(log), [log]);
  const confirmDelete = () =>
    Alert.alert('Delete this session?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onDelete },
    ]);
  return (
    <>
      <ActivityItemRow item={item} today={today} onPress={onEdit} onMenu={() => setMenuOpen(true)} separator={separator} />
      <ActionSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        title="Session"
        message={`${item.title} · ${item.detail}`}
        actions={[
          { key: 'edit', label: 'Edit session', icon: 'create-outline', onPress: onEdit },
          { key: 'delete', label: 'Delete session', icon: 'trash-outline', destructive: true, onPress: confirmDelete },
        ]}
      />
    </>
  );
}
