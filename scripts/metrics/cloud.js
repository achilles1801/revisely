// Cloud Logging and Cloud Monitoring reads for the metrics collector (read-only: roles/logging.viewer,
// roles/monitoring.viewer). Revo's log lines carry counts, tokens, costs and, from #497, the account's
// uid; never question or answer text.

/** Every log entry matching `filter` since `sinceIso`, oldest first (pages of 1000). */
async function logEntries(call, project, filter, sinceIso, { max = 200000 } = {}) {
  const out = [];
  let pageToken;
  do {
    const body = {
      resourceNames: [`projects/${project}`],
      filter: `${filter} AND timestamp>="${sinceIso}"`,
      orderBy: 'timestamp asc',
      pageSize: 1000,
      ...(pageToken ? { pageToken } : {}),
    };
    const res = await call('https://logging.googleapis.com/v2/entries:list', { method: 'POST', body });
    for (const e of res.entries || []) out.push(e);
    pageToken = res.nextPageToken;
  } while (pageToken && out.length < max);
  return out;
}

/** Revo's log lines (`logger.info('revo', …)`), flattened to what the metrics use. */
function revoLine(e) {
  const p = e.jsonPayload || {};
  const n = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
  return {
    t: Date.parse(e.timestamp),
    service: e.resource?.labels?.service_name || '',
    event: String(p.event || ''),
    cached: p.cached === true,
    attempts: n(p.attempts),
    costUsd: n(p.costUsd),
    input: n(p.input),
    output: n(p.output),
    cacheRead: n(p.cacheRead),
    cacheWrite: n(p.cacheWrite),
    code: p.code == null ? null : String(p.code),
    stop: p.stop == null ? null : String(p.stop),
    uid: typeof p.uid === 'string' ? p.uid : null,
  };
}

const REVO_FILTER = 'resource.type="cloud_run_revision" AND jsonPayload.message="revo"';
const ERROR_FILTER = 'resource.type="cloud_run_revision" AND severity>=ERROR';

/**
 * One Monitoring query: time series of `metric` over [start, end], aligned to `periodS` seconds,
 * reduced across series and grouped by `groupBy` labels. Returns [{labels, points: [{t, v}]}].
 */
async function series(call, project, { metric, start, end, periodS, aligner, reducer, groupBy = [], extraFilter = '' }) {
  const q = new URLSearchParams();
  q.set('filter', `metric.type="${metric}"${extraFilter ? ' AND ' + extraFilter : ''}`);
  q.set('interval.startTime', new Date(start).toISOString());
  q.set('interval.endTime', new Date(end).toISOString());
  q.set('aggregation.alignmentPeriod', `${periodS}s`);
  q.set('aggregation.perSeriesAligner', aligner);
  if (reducer) q.set('aggregation.crossSeriesReducer', reducer);
  for (const g of groupBy) q.append('aggregation.groupByFields', g);
  q.set('pageSize', '10000');
  const out = [];
  let pageToken;
  do {
    if (pageToken) q.set('pageToken', pageToken);
    const res = await call(`https://monitoring.googleapis.com/v3/projects/${project}/timeSeries?${q}`);
    for (const ts of res.timeSeries || []) {
      const labels = { ...(ts.metric?.labels || {}), ...(ts.resource?.labels || {}) };
      const points = (ts.points || []).map((p) => {
        const v = p.value || {};
        const val = v.int64Value != null ? Number(v.int64Value) : v.doubleValue != null ? Number(v.doubleValue) : v.distributionValue ? Number(v.distributionValue.mean || 0) : 0;
        return { t: Date.parse(p.interval.endTime), v: val };
      });
      out.push({ labels, points });
    }
    pageToken = res.nextPageToken;
  } while (pageToken);
  return out;
}

const RUN = 'resource.type="cloud_run_revision"';

module.exports = { logEntries, revoLine, series, REVO_FILTER, ERROR_FILTER, RUN };
