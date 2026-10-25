#!/usr/bin/env node
// Full detail of a Sentry issue for investigating it (used by the Claude fix
// workflow): the latest event's exception, all frames, breadcrumbs, tags and
// update context. Usage: node issue-details.js <sentry issue id or short id>
// Prints to stdout only; never written to GitHub.

const { sentryApi } = require('./api');

async function main() {
  const id = process.argv[2];
  if (!id) throw new Error('Usage: issue-details.js <issue id>');
  const e = await sentryApi.latestEvent(id);
  const out = {
    eventID: e.eventID,
    dateCreated: e.dateCreated,
    release: e.release,
    environment: e.environment,
    message: e.message,
    tags: Object.fromEntries((e.tags || []).map((t) => [t.key, t.value])),
    ota_updates: e.contexts?.ota_updates,
    app: e.contexts?.app,
    exception: (e.entries || []).find((x) => x.type === 'exception')?.data?.values?.map((v) => ({
      type: v.type,
      value: v.value,
      frames: (v.stacktrace?.frames || []).map((f) => ({
        inApp: f.inApp,
        function: f.function,
        file: f.filename || f.absPath || f.module,
        line: f.lineNo,
        col: f.colNo,
        context: (f.context || []).map(([n, l]) => `${n}: ${l}`),
      })),
    })),
    breadcrumbs: ((e.entries || []).find((x) => x.type === 'breadcrumbs')?.data?.values || [])
      .slice(-40)
      .map((b) => `${b.timestamp} ${b.category || ''} ${b.level || ''} ${b.message || JSON.stringify(b.data || {})}`),
    extra: e.context,
  };
  console.log(JSON.stringify(out, null, 2));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
