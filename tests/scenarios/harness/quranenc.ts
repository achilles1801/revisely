// QuranEnc.com (translations) and alquran.cloud (the Arabic) for scenarios: their real answers,
// recorded Nov 8 2026 in tests/scenarios/fixtures/quranenc (the list of translations, Al-Ikhlas in
// three translations, the Arabic of page 604), served at the phone's edge. Everything above fetch is
// the app's own code. A request with nothing recorded answers 404; offline (Phone.goOffline, the
// netinfo harness) it fails as React Native's fetch does.
//
// To record more: curl the same URL into the fixtures folder (the list keeps only the fields the app
// reads). A whole translation for a download is too big to record: `serveWhole(key)` makes QuranEnc
// answer every sura of it, recorded where there is a recording and otherwise "<key> <sura>:<ayah>"
// for each verse, in QuranEnc's shape; `failSura` makes one sura fail (503) until `healSura`;
// `holdFrom` stalls the connection at a sura until `releaseHeld`, so a test sees a download midway
// at a point it knows (a delay instead raced the test: on a slow runner the download ended between
// two looks).
import fs from 'fs';
import path from 'path';

const FIXTURES = path.join(__dirname, '..', 'fixtures', 'quranenc');
const QURANENC = /^https:\/\/quranenc\.com\/api\/v1\/(.+)$/;
const ALQURAN = /^https:\/\/api\.alquran\.cloud\/v1\/(.+)$/;

interface StandIn {
  /** Every URL asked of either service, in order. */
  requests: string[];
  /** Versions the list says, over the recorded ones (a new version published). */
  versions: Map<string, string>;
  /** Translations QuranEnc answers every sura of (serveWhole). */
  whole: Set<string>;
  /** "key/sura" that answer 503. */
  failing: Set<string>;
  /** Per translation, the first sura whose request waits for releaseHeld (a stalled connection). */
  holdFrom: Map<string, number>;
  /** Requests waiting: each is let through (true) or fails as offline (false). */
  held: ((through: boolean) => void)[];
}

const g = globalThis as unknown as { __scenarioQuranEnc?: StandIn; __scenarioNet?: { online: boolean } };
export const quranEnc: StandIn = (g.__scenarioQuranEnc ??= {
  requests: [],
  versions: new Map(),
  whole: new Set(),
  failing: new Set(),
  holdFrom: new Map(),
  held: [],
});

/**
 * Every request for a sura of `key` from `sura` on waits until releaseHeld(): a download gets the
 * suras before it and then stands still there, however fast or slow the machine.
 */
export function holdFrom(key: string, sura: number): void {
  quranEnc.holdFrom.set(key, sura);
}

/** Lets the held requests through, and holds nothing more. */
export function releaseHeld(): void {
  quranEnc.holdFrom.clear();
  quranEnc.held.splice(0).forEach((go) => go(true));
}

/** QuranEnc answers every sura of `key` (a download). */
export function serveWhole(key: string): void {
  quranEnc.whole.add(key);
}

export function failSura(key: string, sura: number): void {
  quranEnc.failing.add(`${key}/${sura}`);
}

export function healSura(key: string, sura: number): void {
  quranEnc.failing.delete(`${key}/${sura}`);
}

/** QuranEnc's list says `key` is now at `version`. */
export function publishVersion(key: string, version: string): void {
  quranEnc.versions.set(key, version);
}

/** Requests whose URL holds `part`. */
export function requestsTo(part: string): string[] {
  return quranEnc.requests.filter((u) => u.includes(part));
}

export function resetQuranEnc(): void {
  quranEnc.requests.length = 0;
  quranEnc.versions.clear();
  quranEnc.whole.clear();
  quranEnc.failing.clear();
  quranEnc.holdFrom.clear();
  // A test that ended with requests held: they fail, so nothing of it lands in the next test.
  quranEnc.held.splice(0).forEach((go) => go(false));
}

/** Whether a request (its route under /api/v1/) waits for releaseHeld. */
function isHeld(route: string): boolean {
  const sura = /^translation\/sura\/([a-z0-9_]+)\/(\d+)$/.exec(route);
  const from = sura ? quranEnc.holdFrom.get(sura[1]) : undefined;
  return from != null && Number(sura![2]) >= from;
}

/** A sura in QuranEnc's shape, its text made up: "<key> <sura>:<ayah>". */
function madeUpSura(key: string, sura: number): unknown {
  const { getSurahDisplay } = require('../../../src/lib/quranData') as typeof import('../../../src/lib/quranData');
  const count = getSurahDisplay(sura)?.ayahCount ?? 0;
  return {
    result: Array.from({ length: count }, (_, i) => ({
      id: String(i + 1),
      sura: String(sura),
      aya: String(i + 1),
      arabic_text: '',
      translation: `${key} ${sura}:${i + 1}`,
      footnotes: '',
    })),
  };
}

function answer(status: number, body: unknown): Response {
  const text = JSON.stringify(body);
  // Parsed in the test's own realm (as harness/functions does): a phone has one.
  return { ok: status >= 200 && status < 300, status, text: async () => text, json: async () => JSON.parse(text) } as unknown as Response;
}

function recorded(rel: string): unknown | undefined {
  const file = path.join(FIXTURES, rel);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : undefined;
}

function serveQuranEnc(route: string): Response {
  if (route === 'translations/list') {
    const list = recorded('list.json') as { translations: { key: string; version: string }[] };
    return answer(200, {
      translations: list.translations.map((t) => ({ ...t, version: quranEnc.versions.get(t.key) ?? t.version })),
    });
  }
  const sura = /^translation\/sura\/([a-z0-9_]+)\/(\d+)$/.exec(route);
  if (sura && quranEnc.failing.has(`${sura[1]}/${Number(sura[2])}`)) return answer(503, { error: 'Unavailable' });
  const body = sura ? recorded(`sura/${sura[1]}/${sura[2]}.json`) : undefined;
  if (body) return answer(200, body);
  if (sura && quranEnc.whole.has(sura[1]) && Number(sura[2]) >= 1 && Number(sura[2]) <= 114) {
    return answer(200, madeUpSura(sura[1], Number(sura[2])));
  }
  return answer(404, { error: 'Not recorded' });
}

function serveAlQuran(route: string): Response {
  const page = /^page\/(\d+)\/([a-z.-]+)$/.exec(route);
  const body = page ? recorded(`alquran/page-${page[1]}-${page[2]}.json`) : undefined;
  return body ? answer(200, body) : answer(404, { code: 404, status: 'Not recorded' });
}

/** Installs the stand-in in front of fetch (once per test file). */
export function installQuranEnc(): void {
  const real = global.fetch;
  if ((real as { __scenarioQuranEnc?: boolean }).__scenarioQuranEnc) return;
  const routed = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const qe = QURANENC.exec(url);
    const aq = ALQURAN.exec(url);
    if (!qe && !aq) return real(input as RequestInfo, init);
    quranEnc.requests.push(url);
    // What React Native's fetch throws without a connection.
    if (g.__scenarioNet && !g.__scenarioNet.online) throw new TypeError('Network request failed');
    if (qe && isHeld(qe[1])) {
      const through = await new Promise<boolean>((go) => quranEnc.held.push(go));
      if (!through) throw new TypeError('Network request failed');
    }
    return qe ? serveQuranEnc(qe[1]) : serveAlQuran(aq![1]);
  }) as typeof fetch;
  (routed as { __scenarioQuranEnc?: boolean }).__scenarioQuranEnc = true;
  global.fetch = routed;
}
