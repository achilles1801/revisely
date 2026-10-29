// The athan voices: the catalog at revisely.app/athan/catalog.json (worker/athan.ts,
// from the R2 bucket) read into what the app shows, plus the one voice bundled in
// the app. Pure: no network or files here (lib/athan/store does those).
//
// The catalog comes from our server, but it is still read defensively: ids must
// look like ids, links must be ours, text is capped, and anything odd is dropped
// rather than shown. A voice that is withdrawn (enabled: false, or gone) is not
// listed, and phones delete their copy of it (store.ts).

export const ATHAN_BASE_URL = 'https://revisely.app/athan/';
export const ATHAN_CATALOG_URL = `${ATHAN_BASE_URL}catalog.json`;

/** The voice bundled in the app (assets/sounds): always there, never downloaded or deleted. */
export const BUNDLED_ATHAN_VOICE_ID = 'icr-asim-javed';

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface AthanVoice {
  id: string;
  /** "Makkah – Masjid al-Haram (Fajr)". */
  name: string;
  /** "makkah", "turkish": voices of one style pair as a regular and a Fajr athan. */
  style: string;
  /** A Fajr athan (with "prayer is better than sleep"). */
  fajr: boolean;
  /** "clear": the rights are known (an open licence from the recordist or the
   *  mosque); "unclear": a re-upload or broadcast capture, offered with credit
   *  and withdrawn on any claim (LICENSES.md in the athan project). */
  provenance: 'clear' | 'unclear';
  /** The credit to show (who recorded it, where it was published). */
  credit: string;
  /** "CC0 1.0", "Public Domain Mark 1.0". */
  licence: string;
  licenceUrl: string | null;
  /** Where it was published (Internet Archive). */
  sourceUrl: string | null;
  /** The notification clip (≤ 30 s, iOS's limit): what a prayer's athan plays.
   *  Null: the voice can be listened to, not used for notifications (yet). */
  clip: { url: string; seconds: number; bytes: number | null } | null;
  /** The whole athan, streamed to listen to. */
  full: { url: string; seconds: number; bytes: number | null } | null;
  /** What to play for a preview: the clip (as m4a) if there is one, else the whole athan. */
  previewUrl: string | null;
  /** In the app: always ready, can't be deleted. */
  bundled: boolean;
}

/** The bundled voice's details, for when the catalog hasn't been read (offline, first launch). */
export const BUNDLED_ATHAN_VOICE: AthanVoice = {
  id: BUNDLED_ATHAN_VOICE_ID,
  name: 'Asim Javed (ICR mosque)',
  style: 'general',
  fajr: false,
  provenance: 'clear',
  credit: 'Adhan by Asim Javed (ICR), Internet Archive',
  licence: 'CC0 1.0',
  licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  sourceUrl: 'https://archive.org/details/icr-friday-prayer-1st-adhan-17th-may-2024-9th-dhul-qadah-1445-by-asim-javed',
  clip: { url: `${ATHAN_BASE_URL}notif/${BUNDLED_ATHAN_VOICE_ID}.caf`, seconds: 29.5, bytes: null },
  full: null,
  previewUrl: `${ATHAN_BASE_URL}notif/${BUNDLED_ATHAN_VOICE_ID}.m4a`,
  bundled: true,
};

export function isAthanVoiceId(id: unknown): id is string {
  return typeof id === 'string' && id.length <= 64 && ID.test(id);
}

const text = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;

/** Only our own files, under /athan/. */
const ours = (v: unknown): string | null => {
  if (typeof v !== 'string' || !v.startsWith(ATHAN_BASE_URL)) return null;
  const rest = v.slice(ATHAN_BASE_URL.length);
  return /^(?:notif|full|previews)\/[a-z0-9]+(?:-[a-z0-9]+)*\.(?:caf|m4a)$/.test(rest) ? v : null;
};

/** Any http(s) link, for credits (licence, source page). */
const link = (v: unknown): string | null =>
  typeof v === 'string' && /^https?:\/\/[^\s]+$/.test(v) && v.length <= 300 ? v : null;

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);

function parseVoice(raw: unknown): AthanVoice | null {
  const v = (raw ?? {}) as Record<string, unknown>;
  if (!isAthanVoiceId(v.id) || v.enabled !== true) return null;
  const name = text(v.name, 120);
  if (!name) return null;
  const notif = (v.notif ?? null) as Record<string, unknown> | null;
  const full = (v.full ?? null) as Record<string, unknown> | null;
  // The clip iOS plays must be this voice's own .caf, at the path we expect.
  const clipUrl = notif ? ours(notif.ios_caf) : null;
  const clipM4a = notif ? ours(notif.m4a) : null;
  const clip =
    clipUrl === `${ATHAN_BASE_URL}notif/${v.id}.caf`
      ? { url: clipUrl, seconds: num(notif?.duration_s) ?? 30, bytes: num(notif?.ios_caf_bytes) }
      : null;
  const fullUrl = full ? ours(full.url) : null;
  const fullInfo = fullUrl ? { url: fullUrl, seconds: num(full?.duration_s) ?? 0, bytes: num(full?.bytes) } : null;
  if (!clip && !fullInfo) return null;
  const provenance = v.provenance === 'high' || v.provenance === 'medium' ? 'clear' : 'unclear';
  return {
    id: v.id,
    name,
    style: text(v.style, 40) ?? 'other',
    fajr: v.fajr === true,
    provenance,
    credit: text(v.attribution, 400) ?? name,
    licence: text(v.license, 120) ?? 'See source',
    licenceUrl: link(v.license_url),
    sourceUrl: link(v.source_page),
    clip,
    full: fullInfo,
    previewUrl: clip && clipM4a ? clipM4a : (fullInfo?.url ?? null),
    bundled: v.id === BUNDLED_ATHAN_VOICE_ID,
  };
}

/**
 * The voices to offer, from the catalog's JSON (null: none read yet). The
 * bundled voice is always first; the rest keep the catalog's order. On Android
 * only the bundled voice can be a notification sound (`downloads`: false), so
 * others are listed as listen-only there.
 */
export function parseAthanCatalog(json: unknown, { downloads = true }: { downloads?: boolean } = {}): AthanVoice[] {
  const voices = Array.isArray((json as { voices?: unknown } | null)?.voices)
    ? ((json as { voices: unknown[] }).voices.map(parseVoice).filter(Boolean) as AthanVoice[])
    : [];
  const seen = new Set<string>();
  const unique = voices.filter((v) => (seen.has(v.id) ? false : (seen.add(v.id), true)));
  const fromCatalog = unique.find((v) => v.id === BUNDLED_ATHAN_VOICE_ID);
  const bundled: AthanVoice = fromCatalog
    ? { ...fromCatalog, clip: fromCatalog.clip ?? BUNDLED_ATHAN_VOICE.clip, bundled: true }
    : BUNDLED_ATHAN_VOICE;
  const rest = unique
    .filter((v) => v.id !== BUNDLED_ATHAN_VOICE_ID)
    .map((v) => (downloads ? v : { ...v, clip: null }));
  return [bundled, ...rest];
}

/** The catalog's ids whose clip may stay on the phone (the rest are deleted). */
export function clipIds(voices: AthanVoice[]): Set<string> {
  return new Set(voices.filter((v) => v.clip && !v.bundled).map((v) => v.id));
}

/** The Fajr athan of the same style, if the catalog has one ("makkah" → makkah-fajr). */
export function fajrVariant(voice: AthanVoice, voices: AthanVoice[]): AthanVoice | null {
  if (voice.fajr) return voice;
  return voices.find((v) => v.fajr && v.style === voice.style && v.clip) ?? null;
}

/** "350 KB", "4.7 MB". */
export function formatAthanSize(bytes: number | null): string | null {
  if (bytes == null) return null;
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
