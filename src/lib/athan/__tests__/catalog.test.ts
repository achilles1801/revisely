import {
  ATHAN_BASE_URL,
  BUNDLED_ATHAN_VOICE,
  BUNDLED_ATHAN_VOICE_ID,
  clipIds,
  fajrVariant,
  formatAthanSize,
  isAthanVoiceId,
  parseAthanCatalog,
} from '../catalog';

const B = ATHAN_BASE_URL;

/** Shaped like build_athan.py's catalog.json. */
const voice = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: `Voice ${id}`,
  style: 'makkah',
  fajr: false,
  provenance: 'high',
  license: 'CC0 1.0',
  license_url: 'https://creativecommons.org/publicdomain/zero/1.0/',
  attribution: `Credit for ${id}`,
  source_page: `https://archive.org/details/${id}`,
  full: { url: `${B}full/${id}.m4a`, duration_s: 280.5, bytes: 4_700_000 },
  notif: { ios_caf: `${B}notif/${id}.caf`, m4a: `${B}notif/${id}.m4a`, duration_s: 29.5 },
  enabled: true,
  ...extra,
});

const CATALOG = {
  version: 1,
  voices: [
    voice('tr-gocek-fajr', { style: 'turkish', fajr: true, notif: undefined }),
    voice(BUNDLED_ATHAN_VOICE_ID, { name: 'Asim Javed (ICR mosque)', provenance: 'medium', style: 'general' }),
    voice('makkah-regular', { provenance: 'unclear' }),
    voice('makkah-fajr', { provenance: 'unclear', fajr: true }),
    voice('madinah-regular', { provenance: 'unclear', enabled: false }),
    voice('aqsa-maghrib', { provenance: 'unclear', style: 'aqsa' }),
  ],
};

describe('parseAthanCatalog', () => {
  it('the bundled voice first, then the enabled ones in order', () => {
    const v = parseAthanCatalog(CATALOG);
    expect(v.map((x) => x.id)).toEqual([BUNDLED_ATHAN_VOICE_ID, 'tr-gocek-fajr', 'makkah-regular', 'makkah-fajr', 'aqsa-maghrib']);
    expect(v[0].bundled).toBe(true);
    expect(v.slice(1).every((x) => !x.bundled)).toBe(true);
  });

  it('what a voice says: credit, licence, provenance, clip and preview', () => {
    const makkah = parseAthanCatalog(CATALOG).find((x) => x.id === 'makkah-fajr')!;
    expect(makkah).toMatchObject({
      name: 'Voice makkah-fajr',
      style: 'makkah',
      fajr: true,
      provenance: 'unclear',
      credit: 'Credit for makkah-fajr',
      licence: 'CC0 1.0',
      licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
      sourceUrl: 'https://archive.org/details/makkah-fajr',
      clip: { url: `${B}notif/makkah-fajr.caf`, seconds: 29.5, bytes: null },
      full: { url: `${B}full/makkah-fajr.m4a`, seconds: 280.5, bytes: 4_700_000 },
      previewUrl: `${B}notif/makkah-fajr.m4a`,
    });
    // High and medium provenance are "clear".
    expect(parseAthanCatalog(CATALOG).find((x) => x.id === 'tr-gocek-fajr')!.provenance).toBe('clear');
  });

  it('a voice with no notification clip is listen-only: no clip, the whole athan to preview', () => {
    const gocek = parseAthanCatalog(CATALOG).find((x) => x.id === 'tr-gocek-fajr')!;
    expect(gocek.clip).toBeNull();
    expect(gocek.previewUrl).toBe(`${B}full/tr-gocek-fajr.m4a`);
  });

  it('withdrawn (enabled: false) or missing voices are not listed', () => {
    expect(parseAthanCatalog(CATALOG).some((x) => x.id === 'madinah-regular')).toBe(false);
  });

  it('nothing read yet, or nonsense: just the bundled voice', () => {
    for (const json of [null, undefined, {}, { voices: 'x' }, 'text', 42]) {
      expect(parseAthanCatalog(json)).toEqual([BUNDLED_ATHAN_VOICE]);
    }
  });

  it('is defensive: odd ids, foreign or mismatched links and odd text are dropped', () => {
    const bad = parseAthanCatalog({
      voices: [
        voice('Makkah'),
        voice('../etc'),
        voice('ok-voice', { name: '' }),
        voice('elsewhere', {
          notif: { ios_caf: 'https://evil.example/notif/elsewhere.caf', m4a: `${B}notif/elsewhere.m4a` },
          full: { url: 'https://evil.example/full/elsewhere.m4a' },
        }),
        voice('swapped', { notif: { ios_caf: `${B}notif/other-voice.caf` } }),
        voice('long', { name: 'x'.repeat(500), attribution: 'y'.repeat(2000), license_url: 'javascript:alert(1)' }),
        voice('dupe'),
        voice('dupe', { name: 'Second' }),
      ],
    });
    const ids = bad.map((x) => x.id);
    expect(ids).not.toContain('Makkah');
    expect(ids).not.toContain('../etc');
    expect(ids).not.toContain('ok-voice');
    // Neither a clip nor a full athan of ours: dropped.
    expect(ids).not.toContain('elsewhere');
    // A clip at another voice's path isn't this voice's clip.
    const swapped = bad.find((x) => x.id === 'swapped')!;
    expect(swapped.clip).toBeNull();
    const long = bad.find((x) => x.id === 'long')!;
    expect(long.name).toHaveLength(120);
    expect(long.credit).toHaveLength(400);
    expect(long.licenceUrl).toBeNull();
    expect(bad.filter((x) => x.id === 'dupe')).toHaveLength(1);
    expect(bad.find((x) => x.id === 'dupe')!.name).toBe('Voice dupe');
  });

  it('Android (no downloads): the others are listen-only', () => {
    const v = parseAthanCatalog(CATALOG, { downloads: false });
    expect(v[0].clip).not.toBeNull();
    expect(v.slice(1).every((x) => x.clip === null)).toBe(true);
  });
});

describe('helpers', () => {
  it('ids', () => {
    expect(isAthanVoiceId('makkah-fajr')).toBe(true);
    expect(isAthanVoiceId('Makkah')).toBe(false);
    expect(isAthanVoiceId('a/b')).toBe(false);
    expect(isAthanVoiceId(null)).toBe(false);
    expect(isAthanVoiceId('x'.repeat(65))).toBe(false);
  });

  it('clips that may stay on the phone: the listed ones with a clip, never the bundled', () => {
    expect([...clipIds(parseAthanCatalog(CATALOG))].sort()).toEqual(['aqsa-maghrib', 'makkah-fajr', 'makkah-regular']);
  });

  it('the Fajr athan of the same style', () => {
    const v = parseAthanCatalog(CATALOG);
    const makkah = v.find((x) => x.id === 'makkah-regular')!;
    expect(fajrVariant(makkah, v)!.id).toBe('makkah-fajr');
    expect(fajrVariant(v.find((x) => x.id === 'aqsa-maghrib')!, v)).toBeNull();
    expect(fajrVariant(v.find((x) => x.id === 'makkah-fajr')!, v)!.id).toBe('makkah-fajr');
  });

  it('sizes', () => {
    expect(formatAthanSize(345_754)).toBe('338 KB');
    expect(formatAthanSize(4_700_000)).toBe('4.5 MB');
    expect(formatAthanSize(null)).toBeNull();
  });
});
