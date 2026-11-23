import { useAthanCatalog, type AthanVoice } from '../../lib/athan';
import { chosenAthanVoiceId } from '../../lib/prayer/athanChoice';
import { usePrayerPrefs, type PrayerName } from '../../lib/prayer/prefs';

/** The athan voice the prayers use, or one prayer's (null: none chosen, or it's gone from the catalog). */
export function useChosenAthanVoice(prayer?: PrayerName): AthanVoice | null {
  const prefs = usePrayerPrefs();
  const { voices } = useAthanCatalog();
  const id = chosenAthanVoiceId(prefs.alerts, voices, prayer);
  return (id && voices.find((v) => v.id === id)) || null;
}
