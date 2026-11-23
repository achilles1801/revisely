// Where a take runs: on the phone (the engine, lib/reciteLive/localFeed) or on the checker's server (lib/reciteLive/socket).
// One pipeline in two places, chosen per take (on-device-plan.md §12; Revisely Dev only until the release):
// - config/app's `recite.where` (phone, server or auto) moves everyone with no app release;
// - `entitlements/{uid}.reciteWhere`, which no client can write, pins one account to either;
// - Settings → Testing pins this phone, for trying either on a real take.
// The nearest wins: this phone, then the account, then config/app. Whatever asks for the phone, a take the engine can't
// do goes to the server, silently: no engine in this build, no pack, a failed self-check, a level it doesn't run.

import type { StartFrame } from './feed';

export type RunsOn = 'phone' | 'server';
export type WhereSetting = RunsOn | 'auto';

/** rc_info's JSON (recite_core.h): a missing key means no. */
export interface EngineInfo {
  version?: string;
  pack?: string;
  hop?: number;
  levels?: string[];
  can?: {
    letters?: boolean;
    tajweed?: boolean;
    names?: boolean;
    startBy?: boolean;
    startIn?: boolean;
    controls?: boolean;
    clips?: boolean;
  };
  self_check?: { ok?: boolean; max_diff?: number };
}

export function parseEngineInfo(json: string | null | undefined): EngineInfo | null {
  if (!json) return null;
  try {
    const x = JSON.parse(json) as unknown;
    return x && typeof x === 'object' && !Array.isArray(x) ? (x as EngineInfo) : null;
  } catch {
    return null;
  }
}

/** A setting from config/app or a stored choice; anything else is no setting at all. */
export function whereSetting(raw: unknown): WhereSetting | null {
  return raw === 'phone' || raw === 'server' || raw === 'auto' ? raw : null;
}

/** An account's pin: `auto` isn't one. */
export function wherePin(raw: unknown): RunsOn | null {
  return raw === 'phone' || raw === 'server' ? raw : null;
}

/**
 * The stand-in that plays a recorded take's frames (the private repo's replay engine). It judges nothing, so only this
 * phone's Testing choice may send a take to it: never an account's pin, config/app or `auto`.
 */
export const isReplayEngine = (info: EngineInfo): boolean => /replay/.test(info.version ?? '');

/** The take's level, as the engine's `levels` name it. */
export function levelOf(start: StartFrame): 'recite' | 'harakat' | 'strict' {
  if (start.follow) return 'recite';
  return start.tajweed ? 'strict' : 'harakat';
}

/** What the engine lacks for this take, or null when it can run it. */
export function engineLacks(start: StartFrame, info: EngineInfo): string | null {
  const level = levelOf(start);
  if (!info.levels?.includes(level)) return `level:${level}`;
  const can = info.can ?? {};
  if (!can.controls) return 'controls';
  if (start.startBy && !can.startBy) return 'startBy';
  if (start.startIn && !can.startIn) return 'startIn';
  if (level !== 'recite') {
    if (start.letters && !can.letters) return 'letters';
    if (start.tajweed && !can.tajweed) return 'tajweed';
    if (start.namesAfter && !can.names) return 'names';
  }
  return null;
}

export interface WhereInput {
  /** Settings → Testing on this phone (null: Automatic). */
  testing: RunsOn | null;
  pin: RunsOn | null;
  /** config/app's `recite.where`; null while unset. */
  config: WhereSetting | null;
  /** The open engine's rc_info; null: no engine (a stub build, no pack, not opened). */
  engine: EngineInfo | null;
  /** The phone passed its own speed check; null: not known yet. Only `auto` asks. */
  fastEnough: boolean | null;
  start: StartFrame;
}

export interface WhereAnswer {
  on: RunsOn;
  /** Why, for the take's log: `asked`, or what kept it off the phone. */
  why: string;
}

/** Where this take runs. With nothing set it stays on the server, until config/app says otherwise. */
export function chooseWhere(i: WhereInput): WhereAnswer {
  const wanted: WhereSetting = i.testing ?? i.pin ?? i.config ?? 'server';
  if (wanted === 'server') return { on: 'server', why: 'asked' };
  if (!i.engine) return { on: 'server', why: 'no-engine' };
  if (isReplayEngine(i.engine)) return i.testing === 'phone' ? { on: 'phone', why: 'replay' } : { on: 'server', why: 'replay' };
  if (i.engine.self_check?.ok !== true) return { on: 'server', why: 'self-check' };
  const lacks = engineLacks(i.start, i.engine);
  if (lacks) return { on: 'server', why: lacks };
  if (wanted === 'auto' && i.fastEnough !== true) return { on: 'server', why: 'speed' };
  return { on: 'phone', why: 'asked' };
}
