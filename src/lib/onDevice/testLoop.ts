// The on-device bench on Firebase Test Lab's phones (Revisely Dev, Android; BEHAVIOUR.md ONDEV-1). Test Lab launches
// the app with its game-loop intent (plugins/withDevModules adds the filter) and pushes the bench's files as the app's
// OBB, a zip with its own bench.json (a `testLab` section: the runs, windows each, a long run). Nobody signs in on
// those phones, so nothing is downloaded and nothing is sent: the files are checked by SHA-256, each run goes as on
// the bench screen, and the record (the same as onDeviceBench's) is written to the game loop's results file after
// every run, so a timeout still leaves what was done. Closing the app ends the test.

import { Platform } from 'react-native';
import { File } from 'expo-file-system';
import { logger } from '../logger';
import { parseManifest } from './bench';
import { benchEngine, benchRecord, runPlan, type BenchRun } from './benchRun';

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Runs the bench if Test Lab started the app for a game loop; does nothing otherwise (every other launch). */
export async function runTestLoopIfAsked(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const engine = benchEngine();
  const loop = engine?.testLoop?.() ?? null;
  if (!engine || !loop?.results || !engine.unpackObb || !engine.writeTestLoopResult) return;
  const results = loop.results;
  const runs: BenchRun[] = [];
  let windows = 1;
  const write = (status: string, error?: string) =>
    engine.writeTestLoopResult!(
      results,
      JSON.stringify({ status, ...(error ? { error } : {}), ...benchRecord(engine.deviceInfo(), windows, runs) }),
    );
  try {
    const dir = await engine.unpackObb();
    const manifest = parseManifest(JSON.parse(new File(`file://${dir}/bench.json`).textSync()));
    if (!manifest?.testLab) throw new Error('The OBB has no bench.json with a testLab section'); // i18n-ignore (a log)
    windows = manifest.testLab.windows;
    const files: Record<string, string> = {};
    for (const [key, f] of Object.entries(manifest.files)) {
      files[key] = `file://${dir}/${f.path}`;
      const sha = await engine.sha256(files[key]);
      if (sha !== f.sha256) throw new Error(`${f.path}: checksum doesn't match`); // i18n-ignore (a log)
    }
    await write('running');
    for (const plan of manifest.testLab.plans) {
      runs.push(await runPlan(engine, manifest, plan, files, { windows }, () => undefined));
      await write('running');
    }
    if (manifest.testLab.longSec > 0) {
      runs.push(await runPlan(engine, manifest, manifest.testLab.plans[0], files, { durationSec: manifest.testLab.longSec }, () => undefined));
    }
    await write('done');
  } catch (err) {
    logger.warn('Test Lab bench failed', err);
    await write('failed', message(err)).catch(() => undefined);
  } finally {
    engine.finishTestLoop?.();
  }
}
