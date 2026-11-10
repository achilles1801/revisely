#!/usr/bin/env node
// Started every minute by launchd on the owner's Mac (install.sh). Cheap when there is nothing to do:
// one Drive metadata read. It runs the collector when the dashboard's Refresh button asked for it (the
// "refresh" marker's description holds a newer time than the last one handled), or when 6 hours have
// passed since the last run. A new alarm is posted to the "Metrics alerts" GitHub issue, mentioning
// the owner (GitHub emails it and pushes it to the GitHub app), by the metrics workflow.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { loadKey, tokenSource, client } = require('./google');
const { refreshRequest } = require('./drive');
const { run, readConfig, summary, DATA } = require('./collect');

const EVERY_MS = 6 * 3600e3;
const STATE = path.join(DATA, 'state.json');
const LOCK = path.join(DATA, 'lock');

const readState = () => { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { return {}; } };
const writeState = (s) => { fs.mkdirSync(DATA, { recursive: true, mode: 0o700 }); fs.writeFileSync(STATE, JSON.stringify(s, null, 2), { mode: 0o600 }); };

/** One run at a time: a lock directory, taken over when its owner is gone or it is 20 minutes old. */
function lock() {
  fs.mkdirSync(DATA, { recursive: true, mode: 0o700 });
  try {
    fs.mkdirSync(LOCK);
  } catch {
    const age = Date.now() - fs.statSync(LOCK).mtimeMs;
    let pid = 0;
    try { pid = Number(fs.readFileSync(path.join(LOCK, 'pid'), 'utf8')); } catch {}
    let alive = false;
    try { if (pid) { process.kill(pid, 0); alive = true; } } catch {}
    if (alive && age < 20 * 60e3) return false;
    fs.rmSync(LOCK, { recursive: true, force: true });
    fs.mkdirSync(LOCK);
  }
  fs.writeFileSync(path.join(LOCK, 'pid'), String(process.pid));
  return true;
}

/** New alarms since the last run, posted through the metrics workflow (as github-actions, so the mention notifies). */
function postAlarms(cfg, metrics, state) {
  const on = metrics.alerts.filter((a) => a.level === 'alarm');
  const before = new Set(state.alarms || []);
  const fresh = on.filter((a) => !before.has(a.id));
  if (fresh.length) {
    const text = fresh.map((a) => `${a.title}: ${a.value}`).join(' · ').slice(0, 400);
    try {
      execFileSync('gh', ['workflow', 'run', cfg.workflow, '-R', cfg.repo, '-f', `alert=${text}`], { stdio: 'ignore', timeout: 60000 });
    } catch (err) {
      console.error(`Couldn't post the alert: ${err.message}`);
    }
  }
  return on.map((a) => a.id);
}

async function main() {
  const cfg = readConfig();
  const state = readState();
  let requestedAt = null;
  if (cfg.drive.refreshFileId) {
    try {
      const call = client(tokenSource(loadKey(cfg.keyFile)));
      const r = await refreshRequest(call, cfg.drive.refreshFileId);
      if (r && (!state.lastRequest || Date.parse(r) > Date.parse(state.lastRequest))) requestedAt = r;
    } catch (err) {
      console.error(`Couldn't read the refresh marker: ${err.message}`);
    }
  }
  const due = !state.lastRunAt || Date.now() - Date.parse(state.lastRunAt) >= EVERY_MS;
  // After a failed run, scheduled retries wait 15 minutes (a new Refresh tap doesn't).
  const backingOff = state.lastErrorAt && Date.now() - Date.parse(state.lastErrorAt) < 15 * 60e3;
  if (!process.argv.includes('--now') && !requestedAt && (!due || backingOff)) return;
  if (!lock()) return;
  const started = new Date().toISOString();
  try {
    const metrics = await run({ fresh: true, requestedAt });
    const alarms = postAlarms(cfg, metrics, state);
    writeState({ ...state, lastRunAt: started, lastRequest: requestedAt || state.lastRequest || null, alarms, lastErrorAt: null, lastError: null });
    console.log(`[${started}] ${requestedAt ? 'Refresh requested ' + requestedAt : 'Scheduled run'}\n${summary(metrics)}`);
  } catch (err) {
    writeState({ ...state, lastRequest: requestedAt || state.lastRequest || null, lastErrorAt: started, lastError: String(err.message || err).slice(0, 300) });
    throw err;
  } finally {
    fs.rmSync(LOCK, { recursive: true, force: true });
  }
}

main().catch((err) => { console.error(`[${new Date().toISOString()}] ${err.message || err}`); process.exit(1); });
