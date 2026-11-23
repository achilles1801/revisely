// Recite's pack on the phone (Revisely Dev; on-device-plan.md §6 and §13): the plain logic. It reads what the callable
// recitePack answers, says which parts still have to come, and whether the connection allows it now: the offline
// mushaf's rule, Wi-Fi unless "Download over mobile data" is on (or one "Download now" over it). The downloads and the
// native calls are the run's; the pack's key never passes through here, only its wrapped form.

import { onUnmeteredNetwork, type NetworkState } from '../networkState';

export const PACK_FORMAT = 1;
export const PACK_WRAP = 'RSA-OAEP-SHA1';

export type PackPartName = 'core' | 'strict';
const PART_NAMES: readonly PackPartName[] = ['core', 'strict'];

export interface PackPartAnswer {
  part: PackPartName;
  /** A short-lived signed URL for the sealed part. */
  url: string;
  bytes: number;
  sha256: string;
}

export interface PackAnswer {
  packId: string;
  format: number;
  /** The pack's key, encrypted to this phone's own key: only the native module can open it. */
  wrappedKey: string;
  parts: PackPartAnswer[];
  /** When the URLs stop working, ms since the epoch. */
  expiresAt: number;
}

/** Signed URLs come from Cloud Storage: anything else in an answer is refused rather than fetched. */
const SIGNED_URL = /^https:\/\/storage\.googleapis\.com\/[^\s]+$/;
const PACK_ID = /^[a-z0-9][a-z0-9.-]{0,39}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parsePart(raw: unknown): PackPartAnswer | null {
  if (!isObject(raw)) return null;
  const { part, url, bytes, sha256 } = raw;
  if (!PART_NAMES.includes(part as PackPartName)) return null;
  if (typeof url !== 'string' || !SIGNED_URL.test(url)) return null;
  if (typeof bytes !== 'number' || !Number.isSafeInteger(bytes) || bytes <= 0) return null;
  if (typeof sha256 !== 'string' || !SHA256.test(sha256)) return null;
  return { part: part as PackPartName, url, bytes, sha256 };
}

/** The callable's answer, or null when it isn't one this app can use (another format or wrap, a bad field). */
export function parsePackAnswer(raw: unknown): PackAnswer | null {
  if (!isObject(raw)) return null;
  const { packId, format, wrap, wrappedKey, parts, expiresAt } = raw;
  if (typeof packId !== 'string' || !PACK_ID.test(packId)) return null;
  if (format !== PACK_FORMAT || wrap !== PACK_WRAP) return null;
  if (typeof wrappedKey !== 'string' || !BASE64.test(wrappedKey)) return null;
  if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) return null;
  if (!Array.isArray(parts) || parts.length === 0) return null;
  const out: PackPartAnswer[] = [];
  for (const p of parts) {
    const part = parsePart(p);
    if (!part || out.some((o) => o.part === part.part)) return null;
    out.push(part);
  }
  if (!out.some((p) => p.part === 'core')) return null;
  return { packId, format, wrappedKey, parts: out, expiresAt };
}

/** What this phone holds: a sealed part counts only once its size and sha256 were checked. */
export interface PackOnPhone {
  packId: string;
  parts: Partial<Record<PackPartName, { bytes: number; sha256: string }>>;
}

/**
 * The parts still to fetch: all of them for another pack (a new pack has a new key, so nothing of the old one is
 * reusable), else those missing or different from the answer's.
 */
export function partsToFetch(answer: PackAnswer, have: PackOnPhone | null): PackPartAnswer[] {
  if (!have || have.packId !== answer.packId) return answer.parts;
  return answer.parts.filter((p) => {
    const held = have.parts[p.part];
    return !held || held.bytes !== p.bytes || held.sha256 !== p.sha256;
  });
}

/** The connection allows the download now: unmetered, or mobile data allowed (the setting, or one "Download now"). */
export function mayDownloadPack(net: NetworkState | null, allow: { cellular: boolean; once: boolean }): boolean {
  if (!net?.connected) return false;
  return onUnmeteredNetwork(net) || allow.cellular || allow.once;
}

/** A signed URL close to its end is asked for again rather than started: a large part would die half way. */
export const URL_MARGIN_MS = 60_000;

export function urlsStillGood(answer: Pick<PackAnswer, 'expiresAt'>, now: number): boolean {
  return answer.expiresAt - now > URL_MARGIN_MS;
}
