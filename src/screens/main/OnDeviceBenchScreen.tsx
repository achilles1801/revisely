import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { TopBar } from '../../components/v2/TopBar';
import { Tap } from '../../components/v2/Tap';
import { PillButton } from '../../components/v2/PillButton';
import { PillTabs } from '../../components/v2/PillTabs';
import { GroupedSection } from '../../components/plan/Grouped';
import { layoutV2, typeV2 } from '../../theme/v2';
import { useKeepScreenOn } from '../../hooks/useKeepScreenOn';
import { GATE_P95_MS, checkVerdict, longVerdict, planKey, type BenchManifest, type PlanSpec, type Provider } from '../../lib/onDevice/bench';
import {
  benchEngine,
  benchClip,
  benchRecord,
  ensureFiles,
  platformPlans,
  readManifest,
  runPlan,
  recordEngineTest,
  recordSelfCheck,
  sendBenchRecord,
  type EngineTestResult,
  type SelfCheckResult,
  type BenchRun,
} from '../../lib/onDevice/benchRun';
import { coreLine } from '../../lib/onDevice/coreInfo';
import type { ModelCheck } from '../../lib/onDevice/selfCheck';
import { logger } from '../../lib/logger';
import { t } from '../../i18n';

// The lead asks for at least 200 calls a run for p95 (the clip has 173 windows; the bench goes round it again).
const WINDOW_CHOICES = ['60', '200', '600'] as const;
type WindowChoice = (typeof WINDOW_CHOICES)[number];
// A long run (research's 20-minute protocol): one run at the live cadence, battery and heat each minute.
const MINUTE_CHOICES = ['5', '20'] as const;
type MinuteChoice = (typeof MINUTE_CHOICES)[number];
// The engine's hop by phone (the lead, Nov 23): a window every half second, or every second on slower phones.
const HOP_CHOICES = ['500', '1000'] as const;
type HopChoice = (typeof HOP_CHOICES)[number];
const hopSeconds = (ms: number) => (ms / 1000).toString();

const PROVIDER_LABEL: Record<Provider, () => string> = {
  cpu: () => t('settings.bench.providerCpu'),
  coreml: () => t('settings.bench.providerCoreml'),
  xnnpack: () => t('settings.bench.providerXnnpack'),
  nnapi: () => t('settings.bench.providerNnapi'),
};

export function planLabel(p: PlanSpec): string {
  const label = t('settings.bench.plan', {
    model: p.model,
    provider: PROVIDER_LABEL[p.provider](),
    threads: p.threads > 0 ? t('settings.bench.threads', { count: p.threads }) : t('settings.bench.threadsDefault'),
  });
  const memory = p.fromMemory ? t('settings.bench.fromMemory', { plan: label }) : label;
  return p.alsoModel ? t('settings.bench.alsoModel', { plan: memory, model: p.alsoModel }) : memory;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'downloading'; file: number; files: number; percent: number }
  | { kind: 'running'; plan: string; done: number; total: number; long: boolean }
  | { kind: 'sending' }
  | { kind: 'sent' }
  | { kind: 'sendFailed'; error: string }
  | { kind: 'failed'; error: string };

const fixed = (v: number, digits = 0) => (Number.isFinite(v) ? v.toFixed(digits) : '–');
const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

const modelCheckLine = (model: string, m: ModelCheck) =>
  m.ran
    ? t('settings.bench.selfCheckModel', {
        model,
        diff: m.maxDiff === null ? '–' : m.maxDiff.toPrecision(2),
        top: m.topDiff ?? '–',
        frames: m.frames ?? '–',
      })
    : t('settings.bench.selfCheckNoModel', { model });

function selfCheckText({ check, sendError }: SelfCheckResult): string {
  const lines: string[] =
    check.openCode !== null
      ? [t('settings.bench.selfCheckNoOpen', { code: check.openCode, error: check.openError ?? '' })]
      : [
          check.ok === true
            ? t('settings.bench.selfCheckPassed')
            : check.ok === false
              ? t('settings.bench.selfCheckFailed')
              : t('settings.bench.selfCheckUnknown'),
          modelCheckLine('v7', check.v7), // i18n-ignore (the model's name)
          modelCheckLine('v5', check.v5), // i18n-ignore (the model's name)
        ];
  if (sendError) lines.push(t('settings.bench.selfCheckNotSent', { error: sendError }));
  return lines.join('\n');
}

function engineTestText({ run, sendError }: EngineTestResult): string {
  const line = run.interrupted
    ? t('settings.bench.engineTestLeft')
    : run.ok
      ? t('settings.bench.engineTestResult', {
          late: run.lateHops ?? '–',
          hops: run.hops ?? '–',
          worst: run.worstHopMs ?? '–',
          peak: run.peakAfterMb > 0 ? fixed(run.peakAfterMb) : '–',
        })
      : t('settings.bench.engineTestFailed', { error: run.error ?? '' });
  const lines: string[] = [line];
  if (run.ok && run.wouldStepDown) lines.push(t('settings.bench.engineTestStepDown'));
  if (sendError) lines.push(t('settings.bench.selfCheckNotSent', { error: sendError }));
  return lines.join('\n');
}

/**
 * Settings → Testing → On-device model (Revisely Dev; BEHAVIOUR.md ONDEV-1): times Recite's model on this phone, run by
 * run (a model, a provider, a thread count) from the dev backend's list, each checked on the checker's own output
 * first; sends the numbers to the dev backend and offers them to share.
 */
export default function OnDeviceBenchScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const engine = useMemo(() => benchEngine(), []);
  const device = useMemo(() => engine?.deviceInfo() ?? null, [engine]);
  const engineLine = useMemo(() => coreLine(engine), [engine]);
  const [manifest, setManifest] = useState<BenchManifest | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [windows, setWindows] = useState<WindowChoice>('200');
  const [minutes, setMinutes] = useState<MinuteChoice>('20');
  const [hop, setHop] = useState<HopChoice>('500');
  // Which button the last run came from, so its status shows under that button.
  const [longStarted, setLongStarted] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [runs, setRuns] = useState<BenchRun[]>([]);
  const [record, setRecord] = useState<ReturnType<typeof benchRecord> | null>(null);
  // The engine's self-check runs as the screen opens; the runs wait for it, so their memory figures don't carry the engine.
  const [checking, setChecking] = useState(!!engine && !!device);
  const [selfCheck, setSelfCheck] = useState<SelfCheckResult | null>(null);
  // Then a Strict take of the recording, once per pack and app update; the runs wait for that too.
  const [testing, setTesting] = useState<{ done: number; total: number } | null>(null);
  const [engineTest, setEngineTest] = useState<EngineTestResult | null>(null);
  const testStarted = useRef(false);
  const live = useRef(true);
  const busy = status.kind === 'downloading' || status.kind === 'running' || status.kind === 'sending';
  const locked = busy || checking || testing !== null;
  useKeepScreenOn(busy || testing !== null);

  const load = useCallback(() => {
    setReadError(null);
    setManifest(null);
    readManifest()
      .then((m) => live.current && setManifest(m))
      .catch((err) => {
        logger.warn('Bench list failed', err);
        if (live.current) setReadError(err instanceof Error && err.name === 'NoBenchAccess' ? t('settings.bench.noAccess') : message(err));
      });
  }, []);

  useEffect(() => {
    live.current = true;
    if (engine) load();
    return () => {
      live.current = false;
    };
  }, [engine, load]);

  useEffect(() => {
    if (!device) return;
    let on = true;
    recordSelfCheck(device)
      .then((r) => on && setSelfCheck(r))
      .catch((err) => logger.warn('Self-check failed', err))
      .finally(() => on && setChecking(false));
    return () => {
      on = false;
    };
  }, [device]);

  const packId = selfCheck?.check.openCode === null ? selfCheck.check.packId : null;
  useEffect(() => {
    if (!engine || !device || !manifest || !packId || testStarted.current) return;
    testStarted.current = true;
    setTesting({ done: 0, total: 0 });
    recordEngineTest(device, packId, () => benchClip(engine, manifest), () => live.current, (done, total) => {
      if (live.current) setTesting({ done, total });
    })
      .then((r) => {
        if (live.current) setEngineTest(r);
      })
      .catch((err) => logger.warn('Engine test failed', err))
      .finally(() => {
        if (live.current) setTesting(null);
      });
  }, [engine, device, manifest, packId]);

  const plans = manifest ? platformPlans(manifest) : [];
  const chosen = plans.filter((p) => !off.has(planKey(p)));

  /** The chosen runs, N windows each; or (long) the first chosen one for so many minutes at the live cadence. */
  const start = async (long: boolean) => {
    if (!engine || !manifest || !device || chosen.length === 0) return;
    const n = Number(windows);
    const toRun = long ? chosen.slice(0, 1) : chosen;
    const seconds = Number(minutes) * 60;
    const length = long ? { durationSec: seconds, cadenceMs: Number(hop) } : { windows: n };
    setLongStarted(long);
    setRuns([]);
    setRecord(null);
    const done: BenchRun[] = [];
    try {
      setStatus({ kind: 'downloading', file: 0, files: 0, percent: 0 });
      const files = await ensureFiles(engine, manifest, toRun, (p) => {
        if (live.current) {
          setStatus({ kind: 'downloading', file: p.file, files: p.files, percent: p.totalBytes ? Math.floor((100 * p.bytes) / p.totalBytes) : 0 });
        }
      });
      for (const plan of toRun) {
        const label = planLabel(plan);
        if (live.current) setStatus({ kind: 'running', plan: label, done: 0, total: long ? seconds : n, long });
        const run = await runPlan(engine, manifest, plan, files, length, (d, total) => {
          if (live.current) setStatus({ kind: 'running', plan: label, done: d, total, long });
        });
        done.push(run);
        if (live.current) setRuns([...done]);
      }
    } catch (err) {
      logger.warn('Bench failed', err);
      if (live.current) setStatus({ kind: 'failed', error: message(err) });
      if (done.length === 0) return;
    }
    const rec = benchRecord(engine.deviceInfo(), long ? Math.max(1, done[0]?.result.runMs.length ?? 1) : n, done);
    if (live.current) {
      setRecord(rec);
      setStatus((s) => (s.kind === 'failed' ? s : { kind: 'sending' }));
    }
    try {
      await sendBenchRecord(rec);
      if (live.current) setStatus((s) => (s.kind === 'failed' ? s : { kind: 'sent' }));
    } catch (err) {
      logger.warn('Bench record not sent', err);
      if (live.current) setStatus({ kind: 'sendFailed', error: message(err) });
    }
  };

  const share = () => {
    if (record) Share.share({ message: JSON.stringify(record, null, 1) }).catch(() => undefined);
  };

  const statusLine =
    status.kind === 'downloading'
      ? t('settings.bench.downloading', { file: status.file, files: status.files, percent: status.percent })
      : status.kind === 'running'
        ? status.long
          ? t('settings.bench.runningLong', { plan: status.plan, done: Math.floor(status.done / 60), total: Math.round(status.total / 60) })
          : t('settings.bench.running', { plan: status.plan, done: status.done, total: status.total })
        : status.kind === 'sending'
          ? t('settings.bench.sending')
          : status.kind === 'sent'
            ? t('settings.bench.sent')
            : status.kind === 'sendFailed'
              ? t('settings.bench.sendFailed', { error: status.error })
              : status.kind === 'failed'
                ? t('settings.bench.failed', { error: status.error })
                : null;

  const statusText = statusLine ? (
    <Text style={[typeV2.meta, styles.status, { color: palette.secondary }]} testID="bench-status">
      {statusLine}
    </Text>
  ) : null;

  return (
    <View style={[styles.container, { backgroundColor: palette.bg }]} testID="on-device-bench-screen">
      <View style={{ paddingTop: insets.top }}>
        <TopBar title={t('settings.bench.title')} onBack={() => navigation.goBack()} separator />
      </View>
      <ScrollView contentInsetAdjustmentBehavior="never" contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        {!engine ? (
          <Text style={[typeV2.body, styles.note, { color: palette.secondary }]} testID="bench-missing">
            {t('settings.bench.missing')}
          </Text>
        ) : (
          <>
            {device ? (
              <Text style={[typeV2.meta, styles.note, { color: palette.secondary }]} testID="bench-device">
                {t('settings.bench.device', { model: device.soc ? `${device.model} (${device.soc})` : device.model, cores: device.cores, memory: fixed(device.memoryMb / 1024, 1) })}
              </Text>
            ) : null}
            {engineLine ? (
              <Text style={[typeV2.meta, styles.note, { color: palette.secondary }]} testID="bench-engine">
                {engineLine.stub
                  ? t('settings.bench.engineStub')
                  : engineLine.failed
                    ? t('settings.bench.engineFailed', { version: engineLine.version, why: engineLine.failed })
                    : t('settings.bench.engine', { version: engineLine.version })}
              </Text>
            ) : null}
            {checking || selfCheck ? (
              <Text style={[typeV2.meta, styles.note, { color: palette.secondary }]} testID="bench-self-check">
                {selfCheck ? selfCheckText(selfCheck) : t('settings.bench.selfCheckRunning')}
              </Text>
            ) : null}
            {testing || engineTest ? (
              <Text style={[typeV2.meta, styles.note, { color: palette.secondary }]} testID="bench-engine-test">
                {testing
                  ? testing.total > 0
                    ? t('settings.bench.engineTestRunning', { done: testing.done, total: testing.total })
                    : t('settings.bench.engineTestPreparing')
                  : engineTestText(engineTest!)}
              </Text>
            ) : null}
            {readError ? (
              <View style={styles.note}>
                <Text style={[typeV2.body, { color: palette.text }]}>{t('settings.bench.readFailed', { error: readError })}</Text>
                <PillButton title={t('settings.bench.tryAgain')} variant="outline" size="sm" onPress={load} style={styles.retry} />
              </View>
            ) : !manifest ? (
              <Text style={[typeV2.body, styles.note, { color: palette.secondary }]}>{t('settings.bench.reading')}</Text>
            ) : (
              <>
                <GroupedSection header={t('settings.bench.windows')} footer={t('settings.bench.windowsFooter')}>
                  <View style={styles.tabs}>
                    <PillTabs
                      options={WINDOW_CHOICES.map((w) => ({ value: w, label: w }))}
                      value={windows}
                      onChange={setWindows}
                      disabled={locked}
                      testID="bench-windows"
                    />
                  </View>
                </GroupedSection>
                <GroupedSection header={t('settings.bench.runs')}>
                  {plans.map((p) => {
                    const key = planKey(p);
                    const on = !off.has(key);
                    return (
                      <Tap
                        key={key}
                        onPress={() =>
                          setOff((prev) => {
                            const next = new Set(prev);
                            if (on) next.add(key);
                            else next.delete(key);
                            return next;
                          })
                        }
                        disabled={locked}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: on, disabled: busy }}
                        accessibilityLabel={planLabel(p)}
                        style={styles.row}
                      >
                        <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={on ? palette.text : palette.secondary} />
                        <Text style={[typeV2.body, styles.rowText, { color: palette.text }]}>{planLabel(p)}</Text>
                      </Tap>
                    );
                  })}
                </GroupedSection>
                <View style={styles.actions}>
                  <PillButton
                    title={t('settings.bench.run')}
                    size="lg"
                    onPress={() => start(false)}
                    busy={busy && !longStarted}
                    disabled={chosen.length === 0 || locked}
                    testID="bench-run"
                  />
                  {longStarted ? null : statusText}
                </View>
                <GroupedSection header={t('settings.bench.long')} footer={t('settings.bench.longFooter')}>
                  <View style={styles.choice}>
                    <Text style={[typeV2.meta, { color: palette.secondary }]}>{t('settings.bench.longLength')}</Text>
                    <PillTabs
                      options={MINUTE_CHOICES.map((m) => ({ value: m, label: t('settings.bench.minutes', { count: Number(m) }) }))}
                      value={minutes}
                      onChange={setMinutes}
                      disabled={locked}
                      testID="bench-minutes"
                    />
                  </View>
                  <View style={styles.choice}>
                    <Text style={[typeV2.meta, { color: palette.secondary }]}>{t('settings.bench.longPace')}</Text>
                    <PillTabs
                      options={HOP_CHOICES.map((h) => ({ value: h, label: t('settings.bench.hopChoice', { seconds: hopSeconds(Number(h)) }) }))}
                      value={hop}
                      onChange={setHop}
                      disabled={locked}
                      testID="bench-hop"
                    />
                  </View>
                </GroupedSection>
                <View style={styles.actions}>
                  <Text style={[typeV2.body, styles.warning, { color: palette.text }]} testID="bench-long-warning">
                    {t('settings.bench.longStay')}
                  </Text>
                  <PillButton
                    title={t('settings.bench.longRun', { minutes, hop: hopSeconds(Number(hop)) })}
                    size="lg"
                    variant="outline"
                    onPress={() => start(true)}
                    busy={busy && longStarted}
                    disabled={locked || chosen.length === 0}
                    testID="bench-long-run"
                  />
                  {chosen[0] ? (
                    <Text style={[typeV2.meta, styles.status, { color: palette.secondary }]}>
                      {t('settings.bench.longPlan', { plan: planLabel(chosen[0]) })}
                    </Text>
                  ) : null}
                  {longStarted ? statusText : null}
                </View>
                {runs.length > 0 ? (
                  <GroupedSection header={t('settings.bench.results')}>
                    {runs.map((r) => (
                      <RunCard key={`${planKey(r.plan)}${r.long ? '|long' : ''}`} run={r} manifest={manifest} />
                    ))}
                  </GroupedSection>
                ) : null}
                {record && !busy ? (
                  <View style={styles.actions}>
                    <PillButton title={t('settings.bench.share')} variant="outline" onPress={share} testID="bench-share" />
                  </View>
                ) : null}
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function RunCard({ run, manifest }: { run: BenchRun; manifest: BenchManifest }) {
  const { palette } = useTheme();
  const { result, summary } = run;
  const lines: string[] = [];
  const hit = run.interrupted;
  if (!result.ok || !summary) {
    lines.push(t('settings.bench.failed', { error: result.error ?? '' }));
  } else {
    lines.push(
      t('settings.bench.model', { p50: fixed(summary.runP50, 1), p90: fixed(summary.runP90, 1), p95: fixed(summary.runP95, 1), max: fixed(summary.runMax, 1) }),
      summary.underGate ? t('settings.bench.gateUnder', { ms: GATE_P95_MS }) : t('settings.bench.gateOver', { ms: GATE_P95_MS }),
      t('settings.bench.features', { ms: fixed(summary.featureP50, 1), factor: fixed(summary.realTime, 2) }),
      t('settings.bench.load', { load: fixed(result.loadMs / 1000, 1), again: fixed(result.reloadMs / 1000, 1), first: fixed(result.firstRunMs) }),
      t('settings.bench.memory', { loaded: fixed(result.memoryLoadedMb), added: fixed(result.memoryLoadedMb - result.memoryBeforeMb) }),
      ...(run.plan.alsoModel && result.memoryBothMb
        ? [t('settings.bench.memoryBoth', { both: fixed(result.memoryBothMb), added: fixed(result.memoryBothMb - result.memoryBeforeMb) })]
        : []),
      t('settings.bench.heat', { first: fixed(summary.firstP50, 1), last: fixed(summary.lastP50, 1), heat: `${result.thermalBefore} → ${result.thermalAfter}` }),
    );
  }
  if (run.long && result.ok) {
    const v = longVerdict(run.long.minutes, result.samples ?? [], !!hit);
    lines.push(
      v.hot ? t('settings.bench.longHot', { heat: v.hottest ?? '' }) : t('settings.bench.longCool', { heat: v.hottest ?? '' }),
      v.steady ? t('settings.bench.longSteady', { percent: fixed(100 * v.drift, 0) }) : t('settings.bench.longDrift', { percent: fixed(100 * v.drift, 0) }),
      v.batteryNote === 'charging'
        ? t('settings.bench.longCharging')
        : v.batteryNote === 'away'
          ? t('settings.bench.longBatteryAway')
          : v.batteryNote === 'coarse'
            ? t('settings.bench.longBatteryCoarse', { drop: fixed(v.batteryDrop, 0) })
            : t('settings.bench.longBattery', { drop: fixed(v.batteryDrop, 1), perHour: fixed(v.batteryPerHour, 1) }),
      t('settings.bench.longLate', { count: result.late }),
    );
    for (const m of run.long.minutes) {
      const sample = (result.samples ?? []).find((x) => Math.floor(x.t / 60000) === m.minute);
      lines.push(
        t('settings.bench.longMinute', {
          minute: m.minute + 1,
          p50: fixed(m.p50, 1),
          p95: fixed(m.p95, 1),
          battery: sample && sample.battery >= 0 ? `${fixed(sample.battery, 1)}%` : '–',
          heat: sample?.thermal ?? '–',
        }),
      );
    }
  }
  if (result.check) {
    const v = checkVerdict(result.check, manifest.tolerance);
    if (!v.features) lines.push(t('settings.bench.checkFeatures', { diff: result.check.melMaxDiff.toExponential(1) }));
    lines.push(
      v.model === 'exact'
        ? t('settings.bench.checkExact')
        : v.model === 'sameSounds'
          ? t('settings.bench.checkSame', { diff: Math.max(result.check.outMaxDiff, result.check.ownMaxDiff).toFixed(3) })
          : t('settings.bench.checkDiffers', { percent: fixed(100 * Math.min(result.check.outTopSame, result.check.ownTopSame), 1) }),
    );
  } else if (result.checkError) {
    lines.push(t('settings.bench.checkFailed', { error: result.checkError }));
  }
  return (
    <View style={styles.card} testID={`bench-result-${run.plan.model}-${run.plan.provider}-${run.plan.threads}${run.long ? '-long' : ''}`}>
      {hit ? (
        <Text style={[typeV2.meta, styles.interrupted, { color: palette.text }]} testID="bench-interrupted">
          {hit.times > 0
            ? t('settings.bench.interrupted', { count: hit.times, seconds: Math.round(hit.awayMs / 1000), clean: fixed(hit.longestCleanMs / 60000, 1) })
            : t('settings.bench.stalled', { seconds: Math.round(hit.stallMs / 1000), clean: fixed(hit.longestCleanMs / 60000, 1) })}
        </Text>
      ) : null}
      <Text style={[typeV2.body, styles.cardTitle, { color: palette.text }]}>
        {run.long ? t('settings.bench.longTitle', { plan: planLabel(run.plan), minutes: Math.round(run.long.durationSec / 60), hop: hopSeconds(run.long.cadenceMs) }) : planLabel(run.plan)}
      </Text>
      {lines.map((line, i) => (
        <Text key={i} style={[typeV2.meta, typeV2.numeral, { color: palette.secondary }]}>
          {line}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  note: { paddingHorizontal: layoutV2.gutter, paddingTop: 16 },
  retry: { alignSelf: 'flex-start', marginTop: 12 },
  tabs: { paddingHorizontal: layoutV2.gutter, paddingVertical: 12 },
  choice: { paddingHorizontal: layoutV2.gutter, paddingVertical: 10, gap: 8 },
  warning: { fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: layoutV2.gutter, paddingVertical: 10 },
  rowText: { flex: 1, minWidth: 0 },
  actions: { paddingHorizontal: layoutV2.gutter, paddingTop: 20, gap: 10 },
  status: { textAlign: 'center' },
  card: { paddingHorizontal: layoutV2.gutter, paddingVertical: 12, gap: 2 },
  cardTitle: { fontWeight: '600', marginBottom: 2 },
  interrupted: { fontWeight: '600', marginBottom: 2 },
});
