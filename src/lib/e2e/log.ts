// The E2E build's own log (E2E builds only, .maestro/README.md): every console
// line the app's JavaScript writes, appended to Documents/e2e-log.txt, which
// .maestro/run.sh copies next to a failed flow's screenshot (app.log). An iOS
// release build passes only console.error on to the system log, so without this
// a failed flow on the Simulator says nothing about what the app was doing.
//
// Times are the real clock's (as the device and runner logs have them), with
// the app's own (the test clock, src/lib/e2e/clock.ts) beside them.

import { File, Paths } from 'expo-file-system';

// Taken when this module loads, before the test clock replaces Date.
const RealDate = Date;

const LEVELS = ['log', 'info', 'warn', 'error', 'debug'] as const;
const MAX_LINE = 1500;
// One flow's worth: a fresh install (each flow's first step) starts the file again.
const MAX_BYTES = 6_000_000;

let pending: string[] = [];
let installed = false;

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
  // Often enough that a flow failing right after a step has its lines.
  setInterval(flushE2ELog, 500);
}
