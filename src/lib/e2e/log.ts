// The E2E build's own log (E2E builds only, .maestro/README.md): every console
// line the app's JavaScript writes, appended to Documents/e2e-log.txt, which
// .maestro/run.sh copies next to a failed flow's screenshot (app.log). An iOS
// release build passes only console.error on to the system log, so without this
// a failed flow on the Simulator says nothing about what the app was doing.
//
// Times are the real clock's (as the device and runner logs have them), with
// the app's own (the test clock, src/lib/e2e/clock.ts) beside them.

import { File, Paths } from 'expo-file-system';
import { AppState } from 'react-native';

// Taken when this module loads, before the test clock replaces Date.
const RealDate = Date;

const LEVELS = ['log', 'info', 'warn', 'error', 'debug'] as const;
const MAX_LINE = 1500;
// One flow's worth: a fresh install (each flow's first step) starts the file again.
const MAX_BYTES = 6_000_000;
// Lines are written every FLUSH_MS. A JavaScript thread that stops answering (a long job on it, or
// a starved simulator) shows as a gap between those ticks: in #328's run 42746203992 (04 on iOS)
// the app wrote nothing for 30 s while the page still scrolled natively, then two swipes reached
// the JavaScript together and a page went uncounted. Each gap over STALL_MS is one line, so a
// failed flow says how long the app stopped, and from when.
const FLUSH_MS = 500;
const STALL_MS = 2000;

let pending: string[] = [];
let installed = false;
// The last tick's time; 0 while the app is away from the front (iOS holds its timers then).
let lastTick = 0;

function logFile(): File {
  return new File(Paths.document, 'e2e-log.txt');
}

function show(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) {
    const stack = (value.stack ?? '').split('\n').slice(1, 4).join(' | ');
    const code = (value as { code?: unknown }).code;
    return `${value.name}${code ? ` [${String(code)}]` : ''}: ${value.message}${stack ? ` (${stack})` : ''}`;
  }
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function utf8(text: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text);
  const bytes: number[] = [];
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (c < 0x80) bytes.push(c);
    else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else bytes.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return Uint8Array.from(bytes);
}

/** Appends what's waiting to the file. */
export function flushE2ELog(): void {
  if (pending.length === 0) return;
  const text = pending.join('\n') + '\n';
  pending = [];
  try {
    const file = logFile();
    if (!file.exists) file.create();
    if ((file.size ?? 0) > MAX_BYTES) file.write('… (earlier lines dropped)\n');
    const handle = file.open();
    try {
      handle.offset = handle.size ?? 0;
      handle.writeBytes(utf8(text));
    } finally {
      handle.close();
    }
  } catch {
    // Nowhere to write: the lines are dropped, the app carries on.
  }
}

/** One line in the log: `level` and what was logged. */
export function e2eLog(level: string, args: unknown[]): void {
  const real = new RealDate(RealDate.now()).toISOString().slice(11, 23);
  const app = new RealDate(Date.now()).toISOString().slice(0, 16);
  const line = args.map(show).join(' ').replace(/\s*\n\s*/g, ' ⏎ ');
  pending.push(`${real} [app ${app}Z] ${level} ${line.length > MAX_LINE ? `${line.slice(0, MAX_LINE)}…` : line}`);
}

function tick(): void {
  const now = RealDate.now();
  if (lastTick > 0 && now - lastTick > STALL_MS) {
    const since = new RealDate(lastTick).toISOString().slice(11, 23);
    e2eLog('warn', [`[e2e] js stalled ${((now - lastTick) / 1000).toFixed(1)} s, since ${since}`]);
  }
  if (lastTick > 0) lastTick = now;
  flushE2ELog();
}

export function installLog(): void {
  if (installed) return;
  installed = true;
  const target = console as unknown as Record<string, (...args: unknown[]) => void>;
  for (const level of LEVELS) {
    const original = target[level];
    target[level] = (...args: unknown[]) => {
      e2eLog(level, args);
      original?.apply(console, args);
    };
  }
  e2eLog('info', ['[e2e] launch']);
  // Away from the front iOS holds the timers: that gap isn't a stall.
  AppState.addEventListener('change', (state) => {
    lastTick = state === 'active' ? RealDate.now() : 0;
  });
  lastTick = RealDate.now();
  // Often enough that a flow failing right after a step has its lines.
  setInterval(tick, FLUSH_MS);
}
