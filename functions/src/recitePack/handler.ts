/**
 * recitePack: how Recite's pack reaches a phone (BEHAVIOUR.md ONDEV-2; on-device-plan.md §13). Kept free of
 * firebase-admin so its rules can be tested on their own; admin.ts does the reading, writing and signing.
 *
 * Who may: a signed-in caller (the callable enforces App Check), from an app the pack lists (Revisely Dev's iOS and
 * Android apps, not the web app), carrying the pack's custom claim when it names one (on Dev: `onDeviceBench`, as
 * Storage models/recite/ does), within the daily limits (calls, and distinct device keys).
 *
 * What it answers: short-lived signed URLs for the pack's sealed parts in the private bucket, and the pack's key
 * wrapped to the caller's device key (RSA-OAEP, SHA-1 for OAEP and MGF1: the one form Node, iOS's Keychain and the
 * Android Keystore all take from Android 6 on). The device key's private half never leaves that phone's Keychain or
 * Keystore, so JS only ever holds ciphertext, and the tokens of an account aren't enough to read the pack.
 *
 * With no pack doc there is nothing to give: production has none, so it refuses there.
 */
import { constants, createHash, createPublicKey, KeyObject, publicEncrypt } from 'crypto';
import { KEY_BYTES, PACK_ID, PACK_PARTS, PackPart } from './format';

/** How long a part's signed URL works. Downloads that take longer get a new answer (one more call of the day). */
export const URL_TTL_MS = 15 * 60_000;
export const DEFAULT_DAILY_CALLS = 6;
export const DEFAULT_DAILY_KEYS = 3;
/** The device key the module makes: RSA, this size. */
export const DEVICE_KEY_BITS = 2048;
export const WRAP = 'RSA-OAEP-SHA1';

export type PackErrorCode =
  | 'unauthenticated'
  | 'permission-denied'
  | 'invalid-argument'
  | 'failed-precondition'
  | 'resource-exhausted'
  | 'internal';

export class PackError extends Error {
  constructor(readonly code: PackErrorCode, message: string) {
    super(message);
  }
}

export interface PackPartInfo {
  /** The sealed part's object in the default bucket. */
  path: string;
  /** Its size in bytes (the sealed file's). */
  bytes: number;
  /** The sealed file's sha256, hex. */
  sha256: string;
}

/** recitePacks/current (closed to clients). */
export interface PackConfig {
  packId: string;
  format: number;
  parts: Partial<Record<PackPart, PackPartInfo>>;
  /** App Check app ids allowed to fetch it. Empty: none (the pack is off). */
  apps: string[];
  /** A custom claim the caller's token must carry as true, or null for any signed-in account. */
  claim: string | null;
  dailyCalls: number;
  dailyKeys: number;
}

/** recitePackLimits/{uid} (closed to clients): today's calls and the device keys seen today. */
export interface PackLimits {
  day: string;
  calls: number;
  keys: string[];
}

export interface PackAnswer {
  packId: string;
  format: number;
  wrap: typeof WRAP;
  /** The pack's key, encrypted to the device key, base64. */
  wrappedKey: string;
  parts: { part: PackPart; url: string; bytes: number; sha256: string }[];
  /** When the URLs stop working, ms since the epoch. */
  expiresAt: number;
}

export interface PackCaller {
  auth?: { uid: string; token: Record<string, unknown> } | null;
  app?: { appId: string } | null;
  data: unknown;
}

export interface PackDeps {
  now(): number;
  /** recitePacks/current's data, or null when there is none. */
  config(): Promise<unknown>;
  /** recitePackKeys/{packId}'s key, or null. */
  key(packId: string): Promise<Buffer | null>;
  /** Applies `update` to recitePackLimits/{uid} in a transaction; writes `next` unless refused. */
  limits(uid: string, update: (prev: PackLimits | null) => { next: PackLimits; refused: 'calls' | 'keys' | null }): Promise<'calls' | 'keys' | null>;
  /** A v4 signed read URL for an object of the default bucket. */
  signedUrl(path: string, expiresAt: number): Promise<string>;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** recitePacks/current, checked; null when absent or malformed (both mean: no pack to give). */
export function parseConfig(raw: unknown): PackConfig | null {
  if (!isObj(raw)) return null;
  const { packId, format, parts, apps, claim, dailyCalls, dailyKeys } = raw;
  if (typeof packId !== 'string' || !PACK_ID.test(packId)) return null;
  if (typeof format !== 'number' || !Number.isInteger(format) || format < 1) return null;
  if (!isObj(parts)) return null;
  const out: Partial<Record<PackPart, PackPartInfo>> = {};
  for (const name of PACK_PARTS) {
    const p = parts[name];
    if (p === undefined) continue;
    if (!isObj(p)) return null;
    if (typeof p.path !== 'string' || !p.path.startsWith(`packs/recite/${packId}/`)) return null;
    if (typeof p.bytes !== 'number' || !Number.isInteger(p.bytes) || p.bytes <= 0) return null;
    if (typeof p.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(p.sha256)) return null;
    out[name] = { path: p.path, bytes: p.bytes, sha256: p.sha256 };
  }
  if (!out.core) return null;
  if (!Array.isArray(apps) || !apps.every((a) => typeof a === 'string' && a.length > 0)) return null;
  if (claim !== null && claim !== undefined && (typeof claim !== 'string' || !claim)) return null;
  const limit = (v: unknown, d: number) => (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 100 ? v : d);
  return {
    packId,
    format,
    parts: out,
    apps: apps as string[],
    claim: (claim as string | null | undefined) ?? null,
    dailyCalls: limit(dailyCalls, DEFAULT_DAILY_CALLS),
    dailyKeys: limit(dailyKeys, DEFAULT_DAILY_KEYS),
  };
}

export interface PackInput {
  publicKey: KeyObject;
  /** A short hash of the device key's DER, to count distinct keys a day without keeping the key. */
  keyId: string;
  /** The parts asked for, or every part the pack has. */
  parts: PackPart[] | null;
}

/** The caller's payload: `{ publicKey: base64 DER, keyFormat: 'spki' | 'pkcs1', parts?: ['core', 'strict'] }`. */
export function parseInput(data: unknown): PackInput {
  if (!isObj(data)) throw new PackError('invalid-argument', 'Expected an object.');
  const { publicKey, keyFormat, parts } = data;
  if (keyFormat !== 'spki' && keyFormat !== 'pkcs1') throw new PackError('invalid-argument', 'keyFormat must be spki or pkcs1.');
  if (typeof publicKey !== 'string' || publicKey.length < 100 || publicKey.length > 2000 || !/^[A-Za-z0-9+/]+=*$/.test(publicKey)) {
    throw new PackError('invalid-argument', 'publicKey must be a base64 DER RSA public key.');
  }
  const der = Buffer.from(publicKey, 'base64');
  let key: KeyObject;
  try {
    key = createPublicKey({ key: der, format: 'der', type: keyFormat });
  } catch {
    throw new PackError('invalid-argument', 'publicKey is not a readable RSA public key.');
  }
  if (key.asymmetricKeyType !== 'rsa' || key.asymmetricKeyDetails?.modulusLength !== DEVICE_KEY_BITS) {
    throw new PackError('invalid-argument', `publicKey must be RSA-${DEVICE_KEY_BITS}.`);
  }
  let asked: PackPart[] | null = null;
  if (parts !== undefined && parts !== null) {
    if (!Array.isArray(parts) || parts.length === 0 || !parts.every((p) => PACK_PARTS.includes(p as PackPart))) {
      throw new PackError('invalid-argument', `parts must name some of ${PACK_PARTS.join(', ')}.`);
    }
    asked = [...new Set(parts as PackPart[])];
  }
  const spki = key.export({ format: 'der', type: 'spki' });
  return { publicKey: key, keyId: createHash('sha256').update(spki).digest('hex').slice(0, 16), parts: asked };
}

/** The UTC day a limit counts in. */
export function packDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/**
 * One more call against the day's limits. A new day starts from nothing. A key already seen today costs a call but
 * not a key; a refused call still counts, so retrying a refusal doesn't lift it.
 */
export function claimPack(
  prev: PackLimits | null,
  day: string,
  keyId: string,
  limits: { dailyCalls: number; dailyKeys: number },
): { next: PackLimits; refused: 'calls' | 'keys' | null } {
  const today = prev && prev.day === day ? prev : { day, calls: 0, keys: [] };
  const calls = today.calls + 1;
  if (calls > limits.dailyCalls) return { next: { ...today, calls }, refused: 'calls' };
  const known = today.keys.includes(keyId);
  if (!known && today.keys.length >= limits.dailyKeys) return { next: { ...today, calls }, refused: 'keys' };
  return { next: { day, calls, keys: known ? today.keys : [...today.keys, keyId] }, refused: null };
}

/** The pack's key, encrypted to the device's public key (RSA-OAEP with SHA-1, MGF1 SHA-1). */
export function wrapKey(publicKey: KeyObject, packKey: Buffer): Buffer {
  return publicEncrypt({ key: publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha1' }, packKey);
}

export async function handleRecitePack(req: PackCaller, deps: PackDeps): Promise<PackAnswer> {
  const uid = req.auth?.uid;
  if (!uid) throw new PackError('unauthenticated', 'Sign in first.');
  const config = parseConfig(await deps.config());
  if (!config) throw new PackError('failed-precondition', 'There is no pack to download here.');
  const appId = req.app?.appId;
  if (!appId || !config.apps.includes(appId)) throw new PackError('permission-denied', 'This app can’t download the pack.');
  if (config.claim && req.auth?.token?.[config.claim] !== true) {
    throw new PackError('permission-denied', 'This account can’t download the pack yet.');
  }
  const input = parseInput(req.data);
  const parts = (input.parts ?? PACK_PARTS.filter((p) => config.parts[p])).filter((p) => config.parts[p]);
  if (parts.length === 0) throw new PackError('failed-precondition', 'The pack has none of those parts.');

  const now = deps.now();
  const refused = await deps.limits(uid, (prev) => claimPack(prev, packDay(now), input.keyId, config));
  if (refused === 'calls') throw new PackError('resource-exhausted', 'That’s enough downloads for today. Try again tomorrow.');
  if (refused === 'keys') throw new PackError('resource-exhausted', 'Too many phones for this account today. Try again tomorrow.');

  const key = await deps.key(config.packId);
  if (!key || key.length !== KEY_BYTES) throw new PackError('internal', 'The pack has no key.');
  const expiresAt = now + URL_TTL_MS;
  const signed = await Promise.all(
    parts.map(async (part) => {
      const info = config.parts[part]!;
      return { part, url: await deps.signedUrl(info.path, expiresAt), bytes: info.bytes, sha256: info.sha256 };
    }),
  );
  return {
    packId: config.packId,
    format: config.format,
    wrap: WRAP,
    wrappedKey: wrapKey(input.publicKey, key).toString('base64'),
    parts: signed,
    expiresAt,
  };
}
