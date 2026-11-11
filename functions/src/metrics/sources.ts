/**
 * What the metrics console reads, server side (firebase-admin for Firestore; Cloud Logging and Cloud
 * Monitoring over REST with the function's own service account, through the metadata server).
 * Firestore reads name their fields (`select`), so no question or answer text is read for the numbers.
 */
import type { Firestore } from 'firebase-admin/firestore';
import { buckets, ChatRow, LedgerDay, MessageRow, Monitoring, RANGES, RangeKey, RevoLine, SettingsRow } from './aggregate';

/** An access token for the function's own service account (Cloud Run's metadata server). */
export async function metadataToken(fetchImpl: typeof fetch = fetch): Promise<string> {
  const res = await fetchImpl('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', { headers: { 'Metadata-Flavor': 'Google' } });
  if (!res.ok) throw new Error(`metadata token -> ${res.status}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

export type Call = (url: string, init?: { method?: string; body?: unknown }) => Promise<any>;

export function googleClient(token: () => Promise<string>, fetchImpl: typeof fetch = fetch): Call {
  return async (url, init = {}) => {
    const res = await fetchImpl(url, {
      method: init.method ?? 'GET',
      headers: { Authorization: `Bearer ${await token()}`, ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${url.split('?')[0]} -> ${res.status} ${(await res.text()).slice(0, 200)}`);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  };
}

/** users/{uid}/revoChats/{chatId}/messages/{id} → {uid, chatId}. */
function owner(path: string): { uid: string; chatId: string } | null {
  const p = path.split('/');
  return p[0] === 'users' && p[2] === 'revoChats' ? { uid: p[1], chatId: p[3] } : null;
}

export interface FirestoreData {
  chats: ChatRow[];
  messages: MessageRow[];
  settings: SettingsRow[];
  testers: Set<string>;
  ledgerDays: LedgerDay[];
  coach: Record<string, unknown> | null;
  app: Record<string, unknown> | null;
}

export async function readFirestore(db: Firestore): Promise<FirestoreData> {
  const [chats, messages, settings, testers, ledger, coach, app] = await Promise.all([
    db.collectionGroup('revoChats').select('kind', 'day', 'createdAt').get(),
    // Never text, textAfter or title: who, when, and the kinds of things.
    db.collectionGroup('messages').select('role', 'at', 'feedback', 'actionState', 'attach.kind', 'attachments', 'action.kind').get(),
    db.collection('coachSettings').select('revoOn', 'optIn', 'memoryOn').get(),
    db.collection('users').where('previewTester', '==', true).select().get(),
    db.collection('coachLedgerDay').select('day', 'spendUsd', 'calls').get(),
    db.doc('config/coach').get(),
    db.doc('config/app').get(),
  ]);
  const chatRows: ChatRow[] = [];
  for (const d of chats.docs) {
    const o = owner(d.ref.path);
    if (o) chatRows.push({ uid: o.uid, chatId: d.id, kind: d.get('kind'), day: d.get('day'), createdAt: d.get('createdAt') });
  }
  const messageRows: MessageRow[] = [];
  for (const d of messages.docs) {
    const p = d.ref.path.split('/');
    if (p[0] !== 'users' || p[2] !== 'revoChats' || p[4] !== 'messages') continue;
    const list = d.get('attachments');
    const one = d.get('attach.kind');
    const kinds = Array.isArray(list) && list.length ? list.map((a: { kind?: string }) => a?.kind).filter((k): k is string => typeof k === 'string') : typeof one === 'string' ? [one] : [];
    messageRows.push({ uid: p[1], chatId: p[3], role: d.get('role'), at: d.get('at'), feedback: d.get('feedback') ?? null, actionState: d.get('actionState') ?? null, hasAction: typeof d.get('action.kind') === 'string', kinds });
  }
  return {
    chats: chatRows,
    messages: messageRows,
    settings: settings.docs.map((d) => ({ uid: d.id, revoOn: d.get('revoOn'), optIn: d.get('optIn'), memoryOn: d.get('memoryOn') })),
    testers: new Set(testers.docs.map((d) => d.id)),
    ledgerDays: ledger.docs.map((d) => ({ day: String(d.get('day') ?? d.id), spendUsd: Number(d.get('spendUsd')) || 0, calls: Number(d.get('calls')) || 0 })),
    coach: coach.exists ? (coach.data() as Record<string, unknown>) : null,
    app: app.exists ? (app.data() as Record<string, unknown>) : null,
  };
}

const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);

/** Revo's log lines (logger.info('revo', …)) since `sinceIso`, oldest first. */
export async function readRevoLines(call: Call, project: string, sinceIso: string, max = 100000): Promise<RevoLine[]> {
  const out: RevoLine[] = [];
  let pageToken: string | undefined;
  do {
    const res = await call('https://logging.googleapis.com/v2/entries:list', {
      method: 'POST',
      body: {
        resourceNames: [`projects/${project}`],
        filter: `resource.type="cloud_run_revision" AND jsonPayload.message="revo" AND timestamp>="${sinceIso}"`,
        orderBy: 'timestamp asc',
        pageSize: 1000,
        ...(pageToken ? { pageToken } : {}),
      },
    });
    for (const e of res?.entries ?? []) {
      const p = e.jsonPayload ?? {};
      out.push({
        t: Date.parse(e.timestamp),
        service: e.resource?.labels?.service_name ?? '',
        event: String(p.event ?? ''),
        cached: p.cached === true,
        attempts: num(p.attempts),
        costUsd: num(p.costUsd),
        input: num(p.input),
        output: num(p.output),
        cacheRead: num(p.cacheRead),
        cacheWrite: num(p.cacheWrite),
        code: p.code == null ? null : String(p.code),
        stop: p.stop == null ? null : String(p.stop),
        uid: typeof p.uid === 'string' ? p.uid : null,
      });
    }
    pageToken = res?.nextPageToken;
  } while (pageToken && out.length < max);
  return out;
}

interface Series { labels: Record<string, string>; points: { t: number; v: number }[] }

async function series(call: Call, project: string, o: { metric: string; start: number; end: number; periodS: number; aligner: string; reducer?: string; groupBy?: string[]; filter?: string }): Promise<Series[]> {
  const q = new URLSearchParams();
  q.set('filter', `metric.type="${o.metric}"${o.filter ? ` AND ${o.filter}` : ''}`);
  q.set('interval.startTime', new Date(o.start).toISOString());
  q.set('interval.endTime', new Date(o.end).toISOString());
  q.set('aggregation.alignmentPeriod', `${o.periodS}s`);
  q.set('aggregation.perSeriesAligner', o.aligner);
  if (o.reducer) q.set('aggregation.crossSeriesReducer', o.reducer);
  for (const g of o.groupBy ?? []) q.append('aggregation.groupByFields', g);
  const out: Series[] = [];
  let pageToken: string | undefined;
  do {
    if (pageToken) q.set('pageToken', pageToken);
    const res = await call(`https://monitoring.googleapis.com/v3/projects/${project}/timeSeries?${q}`);
    for (const ts of res?.timeSeries ?? []) {
      out.push({
        labels: { ...(ts.metric?.labels ?? {}), ...(ts.resource?.labels ?? {}) },
        points: (ts.points ?? []).map((p: any) => ({ t: Date.parse(p.interval.endTime), v: p.value?.int64Value != null ? Number(p.value.int64Value) : Number(p.value?.doubleValue ?? 0) })),
      });
    }
    pageToken = res?.nextPageToken;
  } while (pageToken);
  return out;
}

const RUN = 'resource.type="cloud_run_revision"';

/** Functions' calls by class and latency per range, Revo's answer time per step, Firestore today. */
export async function readMonitoring(call: Call, project: string, now: number): Promise<Monitoring> {
  const perRange: Monitoring['perRange'] = {};
  const revoLatency: Monitoring['revoLatency'] = {};
  await Promise.all(
    (Object.keys(RANGES) as RangeKey[]).map(async (key) => {
      const r = RANGES[key];
      const start = now - r.ms;
      const periodS = Math.round(r.ms / 1000);
      const B = buckets(key, now);
      const latency = (reducer: string) =>
        series(call, project, { metric: 'run.googleapis.com/request_latencies', start: B.start, end: B.end, periodS: B.step / 1000, aligner: 'ALIGN_DELTA', reducer, groupBy: ['resource.label.service_name'], filter: `${RUN} AND resource.label.service_name="revoask"` });
      const [counts, p50, p95, l50, l95] = await Promise.all([
        series(call, project, { metric: 'run.googleapis.com/request_count', start, end: now, periodS, aligner: 'ALIGN_DELTA', reducer: 'REDUCE_SUM', groupBy: ['resource.label.service_name', 'metric.label.response_code_class'], filter: RUN }),
        series(call, project, { metric: 'run.googleapis.com/request_latencies', start, end: now, periodS, aligner: 'ALIGN_DELTA', reducer: 'REDUCE_PERCENTILE_50', groupBy: ['resource.label.service_name'], filter: RUN }),
        series(call, project, { metric: 'run.googleapis.com/request_latencies', start, end: now, periodS, aligner: 'ALIGN_DELTA', reducer: 'REDUCE_PERCENTILE_95', groupBy: ['resource.label.service_name'], filter: RUN }),
        latency('REDUCE_PERCENTILE_50'),
        latency('REDUCE_PERCENTILE_95'),
      ]);
      const calls: Record<string, Record<string, number>> = {};
      for (const s of counts) {
        const name = s.labels.service_name;
        const cls = s.labels.response_code_class || '2xx';
        calls[name] = calls[name] ?? {};
        calls[name][cls] = (calls[name][cls] ?? 0) + s.points.reduce((a, p) => a + p.v, 0);
      }
      const newest = (list: Series[]) => Object.fromEntries(list.map((s) => [s.labels.service_name, Math.round([...s.points].sort((a, b) => b.t - a.t)[0]?.v ?? 0)]));
      perRange[key] = { calls, p50: newest(p50), p95: newest(p95) };
      const steps = (list: Series[]) => {
        const out = new Array<number | null>(B.n).fill(null);
        for (const s of list) for (const p of s.points) { const i = B.index(p.t - 1); if (i >= 0 && p.v > 0) out[i] = Math.round(p.v / 100) / 10; }
        return out;
      };
      revoLatency[key] = { p50: steps(l50), p95: steps(l95) };
    }),
  );
  const d = new Date(now);
  const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const periodS = Math.max(60, Math.round((now - midnight) / 1000));
  const sum = (metric: string, groupBy: string[] = []) => series(call, project, { metric, start: now - periodS * 1000, end: now, periodS, aligner: 'ALIGN_DELTA', reducer: 'REDUCE_SUM', groupBy }).catch(() => [] as Series[]);
  const total = (list: Series[]) => list.reduce((a, s) => a + s.points.reduce((x, p) => x + p.v, 0), 0);
  const [reads, writes, rules] = await Promise.all([
    sum('firestore.googleapis.com/document/read_count'),
    sum('firestore.googleapis.com/document/write_count'),
    sum('firestore.googleapis.com/rules/evaluation_count', ['metric.label.result']),
  ]);
  return { perRange, revoLatency, firestoreToday: { reads: total(reads), writes: total(writes), denies: total(rules.filter((s) => s.labels.result === 'DENY')) } };
}
