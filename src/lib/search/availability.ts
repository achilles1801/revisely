// Searching the Qur'an by typing is for every account (Majd, Nov 9 2026). By voice it stays with
// preview testers until 1.0.4: the iPhone's microphone purpose string (native, in the binary) and
// the privacy policy name recording and following a hidden page, not searching.
import { Platform } from 'react-native';
import { isMicStreamAvailable } from '../recite/micSource';

type Account = { previewTester?: boolean } | null | undefined;

/** Typed search: anyone signed in. */
export const quranSearchEnabled = (user: Account) => user != null;

/** Whether this binary can listen for a search (the native mic module and Whisper, on iPhone). */
export const canSearchByVoice = () => Platform.OS === 'ios' && isMicStreamAvailable();

/** Searching by voice: testers, on a phone that can listen. */
export const voiceSearchEnabled = (user: Account) => user?.previewTester === true && canSearchByVoice();
