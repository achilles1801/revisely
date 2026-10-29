import { Platform } from 'react-native';

/**
 * Lines for a short Arabic label (a surah's name) set in Amiri. Android measures the
 * voweled text narrower than it draws it, so a two-word name wrapped its last word onto
 * a line that wasn't shown ("آلِ" for Āli-'Imrān). One line on Android; iOS unchanged.
 */
export const arabicLabelLines: number | undefined = Platform.OS === 'android' ? 1 : undefined;

/** The platform's share glyph (Ionicons): Android's three joined dots, iOS's box and arrow. */
export const shareIcon = Platform.OS === 'android' ? 'share-social-outline' : 'share-outline';
