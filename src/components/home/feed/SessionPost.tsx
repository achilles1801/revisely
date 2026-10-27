import React, { useState } from 'react';
import { Alert } from 'react-native';
import { dayAgo, dayOfMonth, weekday } from '../../../lib/dayAgo';
import { describePageRuns, describeSurahRuns, pageRuns } from '../../../lib/pageRanges';
import type { RevisionLog } from '../../../types';
import { ActionSheet } from '../../v2/ActionSheet';
import { Mark } from '../../v2/Mark';
import { RowText, ThreadRow } from '../../v2/ThreadRow';

/** The session's pages: its whole assignment where known (as the classic row shows). */
export function sessionPages(log: RevisionLog): number[] {
  return log.assignedPages && log.assignedPages.length > 0 ? log.assignedPages : [...log.pagesRevised, ...log.pagesSkipped];
}

/** What a session's post says. */
export function sessionText(log: RevisionLog, today: string) {
  const runs = pageRuns(sessionPages(log));
  const total = runs.reduce((n, r) => n + r.last - r.first + 1, 0);
  const revised = log.pagesRevised.length;
  const minutes = log.durationMinutes && log.durationMinutes > 0 ? ` · ${log.durationMinutes} min` : '';
  return {
    name: weekday(log.date),
    meta: dayAgo(log.date, today),
    pages: describePageRuns(runs),
    surahs: describeSurahRuns(runs),
    footer: `${total > revised ? `${revised} of ${total}` : revised} revised${minutes}`,
    complete: total > 0 && revised >= total,
  };
}

/**
 * A past revision session as a post: the day in the mark, the weekday and how
 * long ago, the pages and surahs, how many were revised. Tap to edit; ⋯ to
 * edit or delete.
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
  const t = sessionText(log, today);
  const confirmDelete = () =>
    Alert.alert('Delete this session?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onDelete },
    ]);
  return (
    <>
      <ThreadRow
        mark={<Mark label={dayOfMonth(log.date)} />}
        name={t.name}
        meta={t.meta}
        onMenu={() => setMenuOpen(true)}
        menuLabel="Session options"
        onPress={onEdit}
        separator={separator}
        accessibilityLabel={`${t.name}, ${t.meta}: ${t.pages}, ${t.surahs}. ${t.footer}. Edit`}
        testID={`session-${log.id}`}
      >
        <RowText numberOfLines={1}>{t.pages}</RowText>
        <RowText secondary numberOfLines={1}>
          {t.surahs}
        </RowText>
        <RowText secondary style={{ fontSize: 13, lineHeight: 18, marginTop: 4 }}>
          {t.footer}
        </RowText>
      </ThreadRow>
      <ActionSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        title="Session"
        message={`${t.name} · ${t.pages}`}
        actions={[
          { key: 'edit', label: 'Edit session', icon: 'create-outline', onPress: onEdit },
          { key: 'delete', label: 'Delete session', icon: 'trash-outline', destructive: true, onPress: confirmDelete },
        ]}
      />
    </>
  );
}
