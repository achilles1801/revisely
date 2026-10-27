// When recording backup runs: one run at a time, again whenever something
// changes (settings, the network, the app coming back, a recording saved or
// deleted), and on a backoff after a failure. The backup is listed into this
// phone on an account's first run and then at most every LIST_EVERY_MS (it's a
// read of every recording's record). Screens read the status here.

import { BackupDeps, BackupSettings, BackupStatus, NetworkState, canUpload, defaultDeps, runBackup } from './recordingBackup';
import { cancelUploads } from './recordingCloud';

const RETRY_MS = [60_000, 5 * 60_000, 15 * 60_000, 30 * 60_000];
export const LIST_EVERY_MS = 15 * 60_000;

type BackupConfig = { uid: string; settings: BackupSettings } | null;
let config: BackupConfig = null;
// Offline until NetInfo reports, so nothing uploads before the network type
// (Wi-Fi or mobile data) is known.
const NOT_KNOWN: NetworkState = { connected: false, type: 'none' };
let network: NetworkState = NOT_KNOWN;
let status: BackupStatus = { phase: 'idle', pending: 0, uploaded: 0, restored: 0, at: 0 };
let running = false;
let again = false;
let listNext = false;
let attempt = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let deps: BackupDeps = defaultDeps;
let currentRun: Promise<void> | null = null;
let stoppedConfig: BackupConfig = null;
const lastListed = new Map<string, number>();
let now = () => Date.now();

type Listener = (s: BackupStatus) => void;
const listeners = new Set<Listener>();

export function getBackupStatus(): BackupStatus {
  return status;
}

export function onBackupStatus(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function publish(s: BackupStatus) {
  status = s;
  for (const l of listeners) l(s);
}

const same = (a: BackupConfig, b: BackupConfig) =>
  a?.uid === b?.uid &&
  a?.settings.enabled === b?.settings.enabled &&
  a?.settings.allowCellular === b?.settings.allowCellular &&
  a?.settings.noticeShown === b?.settings.noticeShown;

/** Who is signed in and their backup settings (null when signed out). */
export function configureBackup(next: BackupConfig): void {
  if (same(config, next)) return;
  const was = config;
  config = next;
  attempt = 0;
  // An upload on a network the new settings don't allow (mobile data turned
  // off), or for an account no longer signed in, stops now.
  if (was && (!next || next.uid !== was.uid || !canUpload(network, next.settings) || !next.settings.enabled)) {
    cancelUploads();
  }
  if (!next) {
    clearRetry();
    publish({ phase: 'idle', pending: 0, uploaded: 0, restored: 0, at: now() });
    return;
  }
  // Another account, or backup turned (back) on: list the backup straight away.
  if (!was || was.uid !== next.uid || (!was.settings.enabled && next.settings.enabled)) listNext = true;
  requestBackup();
}

export function setNetwork(next: NetworkState): void {
  const before = network;
  network = next;
  const changed =
    next.connected !== before.connected || next.type !== before.type || !!next.expensive !== !!before.expensive;
  if (!changed) return;
  // Left Wi-Fi (or lost the connection): an upload that may not use this
  // network stops at once instead of finishing on mobile data.
  if (config && !canUpload(next, config.settings)) cancelUploads();
  if (next.connected) requestBackup();
}

/** Run now (or as soon as the current run ends). `list`: also list the backup. */
export function requestBackup({ list = false }: { list?: boolean } = {}): void {
  if (list) listNext = true;
  if (!config) return;
  if (running) {
    again = true;
    return;
  }
  clearRetry();
  // A rerun starts inside this run's finally; leave its handle in place.
  const p: Promise<void> = run().finally(() => {
    if (currentRun === p) currentRun = null;
  });
  currentRun = p;
}

function clearRetry() {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
}

const waitAtMost = (p: Promise<unknown>, ms: number) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([p.then(() => undefined), new Promise<void>((r) => (timer = setTimeout(r, ms)))]).finally(() =>
    clearTimeout(timer),
  );
};

/**
 * Stop backing up: cancel the upload in flight and wait (up to `timeoutMs`) for
 * the run to end. Before deleting the account, so no upload lands after the
 * server has deleted the backup; and before signing out, with `flushDeletes`,
 * so recordings deleted here are deleted from the backup too. `resumeBackup`
 * undoes it (the deletion or sign-out failed).
 */
export async function stopBackup({ flushDeletes = false, timeoutMs = 10_000 } = {}): Promise<void> {
  const cfg = config;
  if (cfg) stoppedConfig = cfg;
  configureBackup(null);
  cancelUploads();
  again = false;
  if (currentRun) await waitAtMost(currentRun, timeoutMs);
  if (flushDeletes && cfg && network.connected) {
    // Deletions only: with backup "off", a run does nothing else.
    await waitAtMost(runBackup(cfg.uid, { ...cfg.settings, enabled: false }, () => network, deps, { list: false }), timeoutMs);
  }
}

/** The sign-out or account deletion went through: nothing to resume. */
export function discardStoppedBackup(): void {
  stoppedConfig = null;
}

export function resumeBackup(): void {
  const cfg = stoppedConfig;
  stoppedConfig = null;
  if (cfg && !config) configureBackup(cfg);
}

async function run() {
  const cfg = config;
  if (!cfg) return;
  running = true;
  // Signed out, or settings changed, during the run: its results are stale (the
  // rerun flag brings a fresh run).
  const current = () => config === cfg;
  const last = lastListed.get(cfg.uid);
  const list = listNext || last == null || now() - last >= LIST_EVERY_MS;
  listNext = false;
  try {
    const result = await runBackup(cfg.uid, cfg.settings, () => network, deps, {
      list,
      stopped: () => !current(),
      onProgress: (s) => {
        if (current()) publish(s);
      },
    });
    if (result.listed) lastListed.set(cfg.uid, now());
    else if (list) listNext = true;
    if (!current()) {
      again = again || !!config;
      return;
    }
    publish(result);
    if (result.phase === 'error') {
      retryTimer = setTimeout(() => requestBackup(), RETRY_MS[Math.min(attempt, RETRY_MS.length - 1)]);
      attempt++;
    } else {
      attempt = 0;
    }
  } finally {
    running = false;
    if (again) {
      again = false;
      requestBackup();
    }
  }
}

/** For tests. */
export function __setBackupDepsForTests(d: BackupDeps | null, clock?: () => number) {
  deps = d ?? defaultDeps;
  now = clock ?? (() => Date.now());
  config = null;
  network = NOT_KNOWN;
  running = false;
  again = false;
  listNext = false;
  attempt = 0;
  currentRun = null;
  stoppedConfig = null;
  lastListed.clear();
  clearRetry();
}
