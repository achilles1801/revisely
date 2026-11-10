// Searching the Qur'an is for every account (Majd, Nov 9 2026): by typing everywhere, and by voice
// on an iPhone whose binary has the microphone module and Whisper (1.0.3 on). Android types only.
// The iPhone's microphone purpose string (native) names searching only from 1.0.4.
import { Platform } from 'react-native';
import { isMicStreamAvailable } from '../recite/micSource';

type Account = { previewTester?: boolean } | null | undefined;

/** Typed search: anyone signed in. */
export const quranSearchEnabled = (user: Account) => user != null;

/** Whether this binary can listen for a search (the native mic module and Whisper, on iPhone). */
export const canSearchByVoice = () => Platform.OS === 'ios' && isMicStreamAvailable();

/** Searching by voice: anyone signed in, on a phone that can listen. */
export const voiceSearchEnabled = (user: Account) => user != null && canSearchByVoice();
