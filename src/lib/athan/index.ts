// Athan voices: the API the prayer settings use (Settings → Prayer → a prayer's
// sound, and the voice picker).
//
//   const { voices, loading, error, refresh } = useAthanCatalog();
//   const state = useAthanVoiceState(voice.id);  // bundled | missing | downloading(progress) | ready
//   await downloadAthanVoice(voice.id);           // true once ready
//   cancelAthanDownload(voice.id);
//   deleteAthanVoice(voice.id);
//   setPrayerAlert('fajr', { sound: 'athan', voice: voice.id });   // lib/prayer/prefs
//
// A voice with `clip: null` can be listened to (previewUrl) but not chosen for a
// notification. `provenance: 'unclear'` voices are offered with their credit and
// "Report a rights issue" (support@revisely.app). On Android only the bundled
// voice plays (ATHAN_DOWNLOADS_SUPPORTED is false there).

export {
  BUNDLED_ATHAN_VOICE,
  BUNDLED_ATHAN_VOICE_ID,
  fajrVariant,
  formatAthanSize,
  type AthanVoice,
} from './catalog';
export {
  ATHAN_DOWNLOADS_SUPPORTED,
  cancelAthanDownload,
  deleteAthanVoice,
  downloadAthanVoice,
  getAthanCatalog,
  refreshAthanCatalog,
  useAthanCatalog,
  useAthanVoiceState,
  type AthanCatalog,
  type AthanVoiceState,
} from './store';
