// Searching the Qur'an (by voice or typing) is for preview testers for now.
import { Platform } from 'react-native';
import { isMicStreamAvailable } from '../recite/micSource';

export const quranSearchEnabled = (user: { previewTester?: boolean } | null | undefined) => user?.previewTester === true;

/** Whether this binary can listen for a search (the native mic module and Whisper, on iPhone). */
export const canSearchByVoice = () => Platform.OS === 'ios' && isMicStreamAvailable();
