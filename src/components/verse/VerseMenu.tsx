import React, { useRef } from 'react';
import { ActionSheet } from '../v2/ActionSheet';

interface VerseMenuProps {
  /** Screen point of the press; null hides the menu. */
  point: { x: number; y: number } | null;
  onPlay: () => void;
  /** Under "Play": who recites, and how far. */
  playSubtitle?: string;
  onTranslation: () => void;
  /** The verse's Arabic and its reference, to the clipboard. */
  onCopy: () => void;
  /** The same text, to the share sheet. */
  onShare: () => void;
  onClose: () => void;
  /** The held verse ("Al-Baqarah 2:255"): the menu's title. */
  verseLabel?: string;
}

/**
 * The menu that opens on a held verse: Play, Translation, Copy and Share. Like every menu it
 * is the ActionSheet: its action runs once the sheet has gone, so the verse
 * sheet can open after it.
 */
export function VerseMenu({
  point,
  onPlay,
  playSubtitle,
  onTranslation,
  onCopy,
  onShare,
  onClose,
  verseLabel,
}: VerseMenuProps) {
  // The title stays while the menu slides away (the selection clears as it closes).
  const lastLabel = useRef(verseLabel);
  if (verseLabel) lastLabel.current = verseLabel;

  return (
    <ActionSheet
      visible={point != null}
      onClose={onClose}
      title={lastLabel.current ?? 'Verse'}
      actions={[
        { key: 'play', label: 'Play', icon: 'play', subtitle: playSubtitle ?? 'to the end of the juz', onPress: onPlay },
        { key: 'translation', label: 'Translation', icon: 'language-outline', onPress: onTranslation },
        { key: 'copy', label: 'Copy', icon: 'copy-outline', onPress: onCopy },
        { key: 'share', label: 'Share', icon: 'share-outline', onPress: onShare },
      ]}
      testID="verse-menu"
    />
  );
}
