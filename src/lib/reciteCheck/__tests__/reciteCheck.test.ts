import { renderHook } from '@testing-library/react-native';
let mockVariant = 'dev';
let mockMic = true;
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return { extra: { variant: mockVariant } };
    },
  },
}));
jest.mock('../../recite/micSource', () => ({ isMicStreamAvailable: () => mockMic }));
jest.mock('../../releaseInfo', () => ({
  currentRelease: () => ({ version: '1.0.4', build: '40', channel: 'dev', updateShort: 'abcd1234' }),
}));

import { reciteCheckEnabled } from '../availability';
import { CheckResult, describeTajweed, describeWord, parseCheckResult, summary } from '../result';
import { checkQuery, checkRecitation, CheckError, RECITE_CHECK_URL } from '../service';
import { parseReciteCheckSettings, RECITE_CHECK_DEFAULTS } from '../settings';
import { chunkSeconds, encodeWav } from '../wav';

describe('who gets the recitation check', () => {
  afterEach(() => {
    mockVariant = 'dev';
    mockMic = true;
  });

  it('is in the Dev app for previewTester accounts only', () => {
    expect(reciteCheckEnabled({ previewTester: true })).toBe(true);
    expect(reciteCheckEnabled({ previewTester: false })).toBe(false);
    expect(reciteCheckEnabled({})).toBe(false);
    expect(reciteCheckEnabled(null)).toBe(false);
  });

  it('never shows in the store app, testers included', () => {
    mockVariant = 'store';
    expect(reciteCheckEnabled({ previewTester: true })).toBe(false);
  });

  it('needs a binary that can stream the microphone', () => {
    mockMic = false;
    expect(reciteCheckEnabled({ previewTester: true })).toBe(false);
  });
});

describe('the recording', () => {
  it('is a 16 kHz mono 16-bit WAV of the chunks in order', () => {
    const wav = encodeWav([Int16Array.from([1, -2]), Int16Array.from([32767])]);
    const v = new DataView(wav.buffer);
    const ascii = (a: number, n: number) => String.fromCharCode(...wav.subarray(a, a + n));
    expect(ascii(0, 4)).toBe('RIFF');
    expect(ascii(8, 4)).toBe('WAVE');
    expect(v.getUint16(22, true)).toBe(1);
    expect(v.getUint32(24, true)).toBe(16000);
    expect(v.getUint16(34, true)).toBe(16);
    expect(v.getUint32(40, true)).toBe(6);
    expect([v.getInt16(44, true), v.getInt16(46, true), v.getInt16(48, true)]).toEqual([1, -2, 32767]);
    expect(wav.length).toBe(50);
    expect(chunkSeconds([new Int16Array(8000), new Int16Array(8000)])).toBe(1);
  });
});

describe('settings', () => {
  it('fall back to the defaults when unknown or damaged', () => {
    expect(parseReciteCheckSettings(null)).toEqual(RECITE_CHECK_DEFAULTS);
    expect(parseReciteCheckSettings('{oops')).toEqual(RECITE_CHECK_DEFAULTS);
    expect(parseReciteCheckSettings(JSON.stringify({ munfasil: 3, aared: 6, keep: false, noticeSeen: true }))).toEqual({
      ...RECITE_CHECK_DEFAULTS,
      aared: 6,
      keep: false,
      noticeSeen: true,
    });
  });

  it('keep recordings as test data by default, and judge any aared length', () => {
    expect(RECITE_CHECK_DEFAULTS.keep).toBe(true);
    expect(RECITE_CHECK_DEFAULTS.aared).toBe(0);
    expect(RECITE_CHECK_DEFAULTS.letters).toBe(false);
  });
});

const answer = {
  v: 1,
  from: 0,
  to: 29,
  secs: 39.7,
  words: [
    { w: 9, status: 'correct', t: [10.1, 10.9] },
    { w: 10, status: 'missed', kind: 'skipped' },
    { w: 13, status: 'wrong', kind: 'lookalike', heard: 'نَعْبُدُ' },
    { w: 14, status: 'bogus' },
  ],
  extras: [{ after: 16, t: 30.1, trail: false }],
  tajweed: [
    { w: 19, rule: 'madd_aared', got: 2.4, expected: 4 },
    { w: 20, rule: 'qalqalah' },
    { w: 21, rule: 'not_a_rule' },
  ],
  letters: null,
  engine: '3f7db28f',
  kept: true,
};

describe('the answer', () => {
  it('is read strictly: unknown statuses and rules are dropped', () => {
    const r = parseCheckResult(answer)!;
    expect(r.words.map((w) => w.w)).toEqual([9, 10, 13]);
    expect(r.tajweed.map((n) => n.rule)).toEqual(['madd_aared', 'qalqalah']);
    expect(r.kept).toBe(true);
    expect(parseCheckResult({ v: 2 })).toBeNull();
    expect(parseCheckResult('nope')).toBeNull();
  });

  it('is worded for the reciter', () => {
    const r = parseCheckResult(answer)!;
    expect(r.words.map(describeWord)).toEqual([null, 'Skipped', 'Said as نَعْبُدُ']);
    expect(describeTajweed(r.tajweed[0])).toBe('Madd ʿarid · about 2 counts, set to 4');
    expect(describeTajweed(r.tajweed[1])).toBe('Qalqalah · not heard');
    expect(describeTajweed({ w: 1, rule: 'madd_lazim', got: 3.2, expected: 6 })).toBe('Madd lazim · about 3 counts, hold it for 6');
    expect(describeTajweed({ w: 1, rule: 'iqlab' })).toBe('Iqlab · the noon said clearly, not as a meem');
    expect(summary(r)).toBe('3 words, 2 tajweed notes');
    expect(summary({ ...r, words: [], extras: [], tajweed: [] } as CheckResult)).toBe('No mistakes heard');
  });
});

describe('asking the service', () => {
  const settings = { ...RECITE_CHECK_DEFAULTS, munfasil: 2 as const };
  const wav = encodeWav([new Int16Array(16000)]);

  it('sends the passage and the settings', () => {
    expect(checkQuery({ sura: 2, ayah: 6 }, null, settings)).toBe('s=2&a=6&mon=2&mot=4&aar=0&letters=0&keep=1');
    expect(checkQuery({ sura: 2, ayah: 6 }, { sura: 2, ayah: 16 }, settings)).toContain('&s2=2&a2=16');
  });

  it('posts the WAV with the account’s ID token and reads the answer', async () => {
    const fetch = jest.fn(async () => ({ ok: true, json: async () => answer }) as unknown as Response);
    const r = await checkRecitation(wav, { sura: 1, ayah: 1 }, null, settings, { token: async () => 'tok', fetch });
    expect(r.words).toHaveLength(3);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${RECITE_CHECK_URL}/check?s=1&a=1&mon=2&mot=4&aar=0&letters=0&keep=1`);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(init.body).toBe(wav);
  });

  it('names each refusal', async () => {
    const refusing = (status: number, body: unknown) =>
      jest.fn(async () => ({ ok: false, status, json: async () => body }) as unknown as Response);
    const run = (fetch: typeof globalThis.fetch, token = 'tok') =>
      checkRecitation(wav, { sura: 1, ayah: 1 }, null, settings, { token: async () => token, fetch }).catch(
        (e: CheckError) => e.reason,
      );
    expect(await run(refusing(403, { error: 'testers_only' }))).toBe('testers_only');
    expect(await run(refusing(429, { error: 'limit' }))).toBe('limit');
    expect(await run(refusing(400, { error: 'bad_request', detail: 'too short' }))).toBe('too_short');
    expect(await run(refusing(500, null))).toBe('server');
    expect(await run(jest.fn(async () => Promise.reject(new Error('offline'))))).toBe('offline');
    expect(await run(refusing(200, null), '')).toBe('sign_in');
  });
});

describe('the check’s settings on the phone', () => {
  it('a change made while the saved settings load wins over what loads, and is saved', async () => {
    const storage = require('@react-native-async-storage/async-storage');
    const AsyncStorage = storage.default ?? storage;
    const { resetReciteCheckSettingsForTests, setReciteCheckSettings, useReciteCheckSettings, parseReciteCheckSettings } =
      require('../settings') as typeof import('../settings');
    resetReciteCheckSettingsForTests();
    await AsyncStorage.setItem('@revisely_recite_check:v1:u9', JSON.stringify({ munfasil: 2, keep: false }));
    setReciteCheckSettings('u9', { noticeSeen: true, mode: 'check' });
    await new Promise((r) => setTimeout(r, 0));
    const { result } = renderHook(() => useReciteCheckSettings('u9'));
    expect(result.current).toMatchObject({ munfasil: 2, keep: false, noticeSeen: true, mode: 'check', level: 'words', saveRecording: true });
    expect(parseReciteCheckSettings(await AsyncStorage.getItem('@revisely_recite_check:v1:u9'))).toMatchObject({ munfasil: 2, mode: 'check', noticeSeen: true });
  });
});
