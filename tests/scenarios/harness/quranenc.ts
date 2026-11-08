// QuranEnc.com (translations) and alquran.cloud (the Arabic) for scenarios: their real answers,
// recorded Nov 8 2026 in tests/scenarios/fixtures/quranenc (the list of translations, Al-Ikhlas in
// three translations, the Arabic of page 604), served at the phone's edge. Everything above fetch is
// the app's own code. A request with nothing recorded answers 404; offline (Phone.goOffline, the
// netinfo harness) it fails as React Native's fetch does.
//
// To record more: curl the same URL into the fixtures folder (the list keeps only the fields the app
// reads).
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
}

const g = globalThis as unknown as { __scenarioQuranEnc?: StandIn; __scenarioNet?: { online: boolean } };
export const quranEnc: StandIn = (g.__scenarioQuranEnc ??= { requests: [], versions: new Map() });

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
  const body = sura ? recorded(`sura/${sura[1]}/${sura[2]}.json`) : undefined;
  return body ? answer(200, body) : answer(404, { error: 'Not recorded' });
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
    return qe ? serveQuranEnc(qe[1]) : serveAlQuran(aq![1]);
  }) as typeof fetch;
  (routed as { __scenarioQuranEnc?: boolean }).__scenarioQuranEnc = true;
  global.fetch = routed;
}
