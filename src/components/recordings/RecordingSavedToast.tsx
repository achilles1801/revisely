import React, { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { UndoToast } from '../revision/UndoToast';
import { say, useScreenReaderOn } from '../reciteLive/a11y';
import { navigateToActivityDay } from '../../navigation/navigationRef';
import { RecordingUndo, releaseUpload, undoRecording } from '../../lib/recordings';
import { logger } from '../../lib/logger';
import { t } from '../../i18n';

/** A recording just saved, as the note after it knows it. */
export interface SavedRecording {
  day: string;
  recordingId: string;
  /** What Undo takes back (the recorder's go); without it, the whole recording (a Recite take). */
  undo?: RecordingUndo;
}

/** How long the note stays: 6 s, or 15 s with a screen reader (there's a note to reach first). */
export const recordingSavedMs = (screenReader: boolean) => (screenReader ? 15_000 : 6_000);

/**
 * "Recording saved · Undo · View", after a recording ends (the reader, a session, a Recite take; Majd, Nov 15 2026:
 * "there should be an undo button for it not just view"). Undo deletes what was just recorded, as a delete would:
 * the whole recording, or only what this go added to a session's recording. Its upload waits while the note shows
 * (lib/recordings' hold), so a recording undone never leaves the phone; View and the note going let it upload.
 */
export function RecordingSavedToast({
  saved,
  onClose,
  bottomInset,
  quiet = false,
}: {
  saved: SavedRecording | null;
  onClose: () => void;
  bottomInset: number;
  /** The microphone is on: nothing is said aloud (it would be recorded). */
  quiet?: boolean;
}) {
  const screenReader = useScreenReaderOn();
  const quietRef = useRef(quiet);
  quietRef.current = quiet;
  const shown = saved?.recordingId ?? null;
  useEffect(() => {
    if (shown && screenReader && !quietRef.current) say(t('recordings.saved.announce'));
  }, [shown, screenReader]);

  const undo = () => {
    if (!saved) return;
    onClose();
    undoRecording(saved.recordingId, saved.undo)
      .then((result) => {
        if (result === 'backedUp') {
          Alert.alert(
            t('recordings.saved.undoFailed'),
            t('recordings.saved.undoBackedUp'),
          );
          return;
        }
        if (screenReader && !quietRef.current) say(t('recordings.saved.deleted'));
      })
      .catch((err) => {
        logger.error('Could not undo a recording', err);
        Alert.alert(t('recordings.saved.undoFailed'), t('recordings.saved.undoRetry'));
      });
  };

  return (
    <UndoToast
      visible={!!saved}
      message={t('recordings.saved.toast')}
      actionLabel={t('recordings.saved.view')}
      duration={recordingSavedMs(screenReader)}
      secondAction={{ label: t('common.undo'), onPress: undo, testID: 'recording-saved-undo' }}
      onUndo={() => {
        const s = saved;
        onClose();
        if (!s) return;
        releaseUpload(s.recordingId);
        navigateToActivityDay(s.day, s.recordingId);
      }}
      onDismiss={() => {
        if (saved) releaseUpload(saved.recordingId);
        onClose();
      }}
      bottomInset={bottomInset}
    />
  );
}
