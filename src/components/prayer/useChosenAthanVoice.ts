import { BUNDLED_ATHAN_VOICE, useAthanCatalog, type AthanVoice } from '../../lib/athan';
import { chosenAthanVoiceId } from '../../lib/prayer/athanChoice';
import { usePrayerPrefs } from '../../lib/prayer/prefs';

/** The athan voice the prayers use (the bundled one until another is chosen, or if it's gone). */
export function useChosenAthanVoice(): AthanVoice {
  const prefs = usePrayerPrefs();
  const { voices } = useAthanCatalog();
  const id = chosenAthanVoiceId(prefs.alerts);
  return (id && voices.find((v) => v.id === id)) || BUNDLED_ATHAN_VOICE;
}
