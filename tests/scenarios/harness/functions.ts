// Our Cloud Functions, as the app reaches them: the real functions in the Firebase emulator
// (scripts/emulators.sh … functions), with the real callable protocol, auth and App Check checks,
// handlers, limits and Firestore writes. Only Anthropic answers from a recording (functions/src/
// emulator.ts).
//
// The app calls https://us-central1-<project>.cloudfunctions.net/<name> (services/firestoreService
// callFunction). The phone's network, here, takes that to the emulator:
//   - refused while the phone is offline (Phone.goOffline), as fetch fails on a phone;
//   - with the scenario's clock (X-Revisely-Test-Now), since a phone's clock and the server's agree.
// Every other request passes through unchanged.

const ORIGIN = `http://${process.env.REVISELY_FUNCTIONS_EMULATOR ?? '127.0.0.1:5001'}`;
const CLOUD = /^https:\/\/us-central1-([a-z0-9-]+)\.cloudfunctions\.net\/([A-Za-z0-9_]+)$/;

export interface Served {
  /** Calls the app made to this function. */
  calls: number;
  /** What the app sent each time (the callable's `data`). */
  sent: unknown[];
  /** What it answered each time: the callable's JSON (`{ result }` or `{ error }`), or the network error. */
  answers: Record<string, unknown>[];
  /** For each call that asked for its answer as it is written (expo/fetch, `Accept: text/event-stream`): the pieces. */
  streams: unknown[][];
}

interface FunctionsNet {
  served: Map<string, Served>;
}

const g = globalThis as unknown as { __scenarioFunctions?: FunctionsNet; __scenarioNet?: { online: boolean } };

function state(): FunctionsNet {
  return (g.__scenarioFunctions ??= { served: new Map() });
}

/** Calls made to `name` since the start of the file (or since `forget`). */
export function served(name: string): Served {
  const s = state().served;
  if (!s.has(name)) s.set(name, { calls: 0, sent: [], answers: [], streams: [] });
  return s.get(name)!;
}

export function forget(name: string): void {
  state().served.delete(name);
}

/** Installs the route to the emulator (once per test file; harness/firebaseSetup). */
export function installFunctionsRoute(): void {
  const real = global.fetch;
  if ((real as { __scenarioFunctions?: boolean }).__scenarioFunctions) return;
  const routed = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const m = CLOUD.exec(url);
    if (!m) return real(input as RequestInfo, init);
    const [, project, name] = m;
    const record = served(name);
    record.calls += 1;
    try {
      record.sent.push(JSON.parse(String(init?.body ?? '{}')).data);
    } catch {
      record.sent.push(undefined);
    }
    if (g.__scenarioNet && !g.__scenarioNet.online) {
      record.answers.push({ network: 'offline' });
      // What React Native's fetch throws without a connection.
      throw new TypeError('Network request failed');
    }
    const headers = { ...((init?.headers ?? {}) as Record<string, string>), 'X-Revisely-Test-Now': String(Date.now()) };
    const res = await real(`${ORIGIN}/${project}/us-central1/${name}`, { ...init, headers });
    if ((init?.headers as Record<string, string> | undefined)?.Accept === 'text/event-stream' && res.ok && res.body) return streamed(res, record);
    const text = await res.text();
    try {
      record.answers.push(JSON.parse(text));
    } catch {
      record.answers.push({ status: res.status, text: text.slice(0, 200) });
    }
    // Parsed here, in the test's own JavaScript realm: Node's Response.json() builds objects of
    // another realm, whose arrays Firestore refuses ("a custom Array object"). A phone has one realm.
    return {
      ok: res.ok,
      status: res.status,
      headers: res.headers,
      text: async () => text,
      json: async () => JSON.parse(text),
    } as unknown as Response;
  }) as typeof fetch;
  (routed as { __scenarioFunctions?: boolean }).__scenarioFunctions = true;
  global.fetch = routed;
}

/**
 * A callable's answer as it is written (the app reads it with expo/fetch): its body handed over as it arrives, as text
 * made again in the test's own realm (Node's buffers are of another, as with Response.json above). The pieces and the
 * last event are recorded once the body ends.
 */
function streamed(res: Response, record: Served): Response {
  const source = res.body!.getReader();
  const decoder = new TextDecoder();
  const pieces: unknown[] = [];
  record.streams.push(pieces);
  let whole = '';
  const finish = () => {
    let last: Record<string, unknown> = { status: res.status, text: whole.slice(0, 200) };
    for (const part of whole.split('\n\n')) {
      const data = part.split('\n').find((l) => l.startsWith('data:'));
      if (!data) continue;
      const event = JSON.parse(data.slice(5)) as Record<string, unknown>;
      if ('message' in event) pieces.push(event.message);
      else last = event;
    }
    record.answers.push(last);
  };
  const body = {
    getReader: () => ({
      read: async (): Promise<{ done: boolean; value?: Uint8Array }> => {
        const { done, value } = await source.read();
        if (done) {
          finish();
          return { done: true };
        }
        const text = decoder.decode(value, { stream: true });
        whole += text;
        return { done: false, value: new TextEncoder().encode(text) };
      },
    }),
  };
  return { ok: res.ok, status: res.status, headers: res.headers, body } as unknown as Response;
}
