// When recording backup runs: one run at a time, again whenever something
// changes (settings, the network, the app coming back, a recording saved or
// deleted), and on a backoff after a failure. Screens read the status here.

import { BackupSettings, BackupStatus, NetworkState, runBackup, defaultDeps, BackupDeps } from './recordingBackup';

const RETRY_MS = [60_000, 5 * 60_000, 15 * 60_000, 30 * 60_000];

type BackupConfig = { uid: string; settings: BackupSettings } | null;
let config: BackupConfig = null;
// Offline until NetInfo reports, so nothing uploads before the network type
// (Wi-Fi or mobile data) is known.
const NOT_KNOWN: NetworkState = { connected: false, type: 'none' };
let network: NetworkState = NOT_KNOWN;
let status: BackupStatus = { phase: 'idle', pending: 0, uploaded: 0, restored: 0, at: 0 };
let running = false;
let again = false;
let attempt = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let deps: BackupDeps = defaultDeps;

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

const same = (a: typeof config, b: typeof config) =>
  a?.uid === b?.uid &&
  a?.settings.enabled === b?.settings.enabled &&
  a?.settings.allowCellular === b?.settings.allowCellular &&
  a?.settings.noticeShown === b?.settings.noticeShown;

/** Who is signed in and their backup settings (null when signed out). */
export function configureBackup(next: typeof config): void {
  if (same(config, next)) return;
  config = next;
  attempt = 0;
  if (!next) {
    clearRetry();
    publish({ phase: 'idle', pending: 0, uploaded: 0, restored: 0, at: Date.now() });
    return;
  }
  requestBackup();
}

export function setNetwork(next: NetworkState): void {
  const cameOnline =
    next.connected && (!network.connected || next.type !== network.type || !!next.expensive !== !!network.expensive);
  network = next;
  if (cameOnline) requestBackup();
}

let currentRun: Promise<void> | null = null;
let stoppedConfig: BackupConfig = null;

/**
 * Stop backing up and wait (up to `timeoutMs`) for a run in progress to end.
 * Before deleting the account, so no upload lands after the server has deleted
 * the backup. `resumeBackup` undoes it (the deletion failed).
 */
export async function stopBackup(timeoutMs = 15_000): Promise<void> {
  stoppedConfig = config;
  configureBackup(null);
  again = false;
  if (!currentRun) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([currentRun, new Promise<void>((r) => (timer = setTimeout(r, timeoutMs)))]);
  clearTimeout(timer);
}

export function resumeBackup(): void {
  const cfg = stoppedConfig;
  stoppedConfig = null;
  if (cfg && !config) configureBackup(cfg);
}

/** Run now (or as soon as the current run ends). */
export function requestBackup(): void {
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

async function run() {
  const cfg = config;
  if (!cfg) return;
  running = true;
  // Signed out, or settings changed, during the run: its results are stale (the
  // rerun flag brings a fresh run).
  const current = () => config === cfg;
  try {
    const result = await runBackup(
      cfg.uid,
      cfg.settings,
      network,
      deps,
      (s) => {
        if (current()) publish(s);
      },
      () => !current(),
    );
    if (!current()) {
      again = again || !!config;
      return;
    }
    publish(result);
    if (result.phase === 'error') {
      retryTimer = setTimeout(requestBackup, RETRY_MS[Math.min(attempt, RETRY_MS.length - 1)]);
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
export function __setBackupDepsForTests(d: BackupDeps | null) {
  deps = d ?? defaultDeps;
  config = null;
  network = NOT_KNOWN;
  running = false;
  again = false;
  attempt = 0;
  currentRun = null;
  stoppedConfig = null;
  clearRetry();
}
