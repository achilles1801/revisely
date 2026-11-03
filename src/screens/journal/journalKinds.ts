import type { Ionicons } from '@expo/vector-icons';
import type { JournalKind } from '../../types';

type IconName = keyof typeof Ionicons.glyphMap;

/** The mark beside each kind of note in the daily log (Activity and the log itself). */
export const JOURNAL_KIND_ICONS: Record<JournalKind, IconName> = {
  memorization: 'book-outline',
  revision: 'repeat-outline',
  note: 'document-text-outline',
};
