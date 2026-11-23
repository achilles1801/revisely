import React, { useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { revisionItem } from '../../../lib/activityItems';
import type { RevisionLog } from '../../../types';
import { ActivityItemRow } from '../../activity/ActivityItemRow';
import { ActionSheet } from '../../v2/ActionSheet';
import { t } from '../../../i18n';

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
  juzPlan = false,
}: {
  log: RevisionLog;
  /** The account plans by juz: a session of whole juz reads "Juz 1" (lib/pageRanges describeRevised). */
  juzPlan?: boolean;
  /** Today's revision day, for "2d". */
  today: string;
  onEdit: () => void;
  onDelete: () => void;
  separator?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const item = useMemo(() => revisionItem(log, { juzPlan }), [log, juzPlan]);
  const confirmDelete = () =>
    Alert.alert(t('home.session.deleteTitle'), t('home.session.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: onDelete },
    ]);
  return (
    <>
      <ActivityItemRow item={item} today={today} onPress={onEdit} onMenu={() => setMenuOpen(true)} separator={separator} />
      <ActionSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={t('home.session.menuTitle')}
        message={`${item.title} · ${item.detail}`}
        actions={[
          { key: 'edit', label: t('home.session.edit'), icon: 'create-outline', onPress: onEdit },
          { key: 'delete', label: t('home.session.delete'), icon: 'trash-outline', destructive: true, onPress: confirmDelete },
        ]}
      />
    </>
  );
}
