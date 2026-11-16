import React, { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { UndoToast } from '../revision/UndoToast';
import { say, useScreenReaderOn } from '../reciteLive/a11y';
import { recordingSavedMs } from '../recordings/RecordingSavedToast';
import { navigateToActivityDay } from '../../navigation/navigationRef';
import { releaseUpload } from '../../lib/recordings';
import { SavedSitting, undoSitting } from '../../lib/sitting';
import { logger } from '../../lib/logger';
import { t } from '../../i18n';

/**
 * "Saved to today: Al-Mulk, ayahs 1–26, 41 min · Undo · View" after a sitting in the reader (REC-1). Undo takes back
 * the sitting and the recording that ended with it, as Activity's Delete session does, with the recording backup's rules
 * (its upload waits while the note shows, as after "Recording saved"). View opens its day; View or the note going lets
 * the recording upload.
 */
export function SittingSavedToast({
  saved,
  onClose,
  bottomInset,
}: {
  saved: SavedSitting | null;
  onClose: () => void;
  bottomInset: number;
}) {
  const screenReader = useScreenReaderOn();
  const shown = saved?.text ?? null;
  const savedRef = useRef(saved);
  savedRef.current = saved;
  useEffect(() => {
    if (shown && screenReader) say(t('timer.sittingSaved.announce', { note: shown }));
  }, [shown, screenReader]);

  const release = (s: SavedSitting | null) => {
    if (s?.recording) releaseUpload(s.recording.recordingId);
  };

  const undo = () => {
    const s = savedRef.current;
    if (!s) return;
    onClose();
    undoSitting(s)
      .then((result) => {
        if (result === 'recordingBackedUp') {
          Alert.alert(t('timer.sittingSaved.recordingStaysTitle'), t('timer.sittingSaved.recordingStays'));
          return;
        }
        if (screenReader) say(t(s.recording ? 'timer.sittingSaved.deletedWithRecording' : 'timer.sittingSaved.deleted'));
      })
      .catch((err) => {
        logger.error('Could not undo a sitting', err);
        Alert.alert(t('timer.sittingSaved.undoFailed'), t('timer.sittingSaved.undoRetry'));
      });
  };

  return (
    <UndoToast
      visible={!!saved}
      message={saved?.text ?? ''}
      actionLabel={t('timer.sittingSaved.view')}
      duration={recordingSavedMs(screenReader)}
      secondAction={{ label: t('common.undo'), onPress: undo, testID: 'sitting-saved-undo' }}
      onUndo={() => {
        const s = savedRef.current;
        onClose();
        if (!s) return;
        release(s);
        navigateToActivityDay(s.day);
      }}
      onDismiss={() => {
        release(savedRef.current);
        onClose();
      }}
      bottomInset={bottomInset}
    />
  );
}
