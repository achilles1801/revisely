#!/usr/bin/env node
/**
 * Does the real API compile each reply schema Revo sends (functions/src/revo/replySchema.ts)? The API also has an
 * unpublished limit on a schema's compiled grammar: past it, every request is a 400 before the model runs. Nov 26 2026:
 * Revisely Dev's schema, with the drafted schedule in it, passed every count we test and was still refused ("The
 * compiled grammar is too large…"), so Revo in Dev never drafted.
 *
 * One tiny request per schema (a two-letter question, max_tokens 16), and the answer goes into
 * functions/test-recordings/anthropic/compiled-schemas.json by the schema's hash. The functions emulator answers a
 * schema the way this file says the API did, and refuses one that isn't in it; replySchema.test.ts fails while a schema
 * Revo sends isn't recorded as compiled. So run this whenever a reply schema changes. A refused schema costs nothing;
 * a compiled one about a cent.
 *
 *   cd functions && npm run build && ANTHROPIC_API_KEY=… node scripts/check-revo-schemas.js [--dry]
 *
 * --dry lists the schemas and their hashes without a call. The key is read from the environment, sent only to
 * api.anthropic.com, and never written or printed.
 */
const fs = require('fs');
const path = require('path');

const lib = path.join(__dirname, '..', 'lib');
if (!fs.existsSync(path.join(lib, 'revo/replySchema.js'))) {
  console.error('Build the functions first: npm run build');
  process.exit(2);
}
const { ANTHROPIC_URL, ANTHROPIC_VERSION } = require(path.join(lib, 'coach/call.js'));
const { REVO_MODEL } = require(path.join(lib, 'coach/pricing.js'));
const { REVO_OUTPUT_CONFIG, REVO_SCHEDULE_OUTPUT_CONFIG } = require(path.join(lib, 'revo/replySchema.js'));
const { schemaSha256 } = require(path.join(lib, 'emulator.js'));

const FILE = path.join(__dirname, '..', 'test-recordings', 'anthropic', 'compiled-schemas.json');
const DRY = process.argv.includes('--dry');
const key = process.env.ANTHROPIC_API_KEY;
if (!key && !DRY) {
  console.error('Set ANTHROPIC_API_KEY (it is never printed or stored), or pass --dry.');
  process.exit(2);
}

/** Every reply schema Revo's requests send, with the model each goes to (the limit may differ by model). */
const SCHEMAS = [
  { name: 'every question but the schedule\'s', outputConfig: REVO_OUTPUT_CONFIG, model: REVO_MODEL },
  { name: 'Edit schedule in Revisely Dev', outputConfig: REVO_SCHEDULE_OUTPUT_CONFIG, model: REVO_MODEL },
];

(async () => {
  const file = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : { how: '', schemas: {} };
  file.how = 'functions/scripts/check-revo-schemas.js: a two-letter question to the real API with each reply schema, max_tokens 16';
  let refused = 0;
  for (const { name, outputConfig, model } of SCHEMAS) {
    // Only the format compiles a grammar; the emulator hashes it alone (emulator.ts).
    const sha = schemaSha256({ format: outputConfig.format });
    if (DRY) {
      console.log(`${name}: ${sha}${file.schemas[sha] ? ` (recorded: ${file.schemas[sha].compiled ? 'compiled' : 'refused'})` : ' (not recorded)'}`);
      continue;
    }
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': ANTHROPIC_VERSION },
      body: JSON.stringify({ model, max_tokens: 16, messages: [{ role: 'user', content: 'hi' }], output_config: { format: outputConfig.format } }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok && res.status !== 400) {
      console.error(`${name}: the API answered ${res.status} (${body?.error?.message ?? 'no message'}); nothing recorded. Try again.`);
      process.exit(1);
    }
    const entry = { name, model, checkedAt: new Date().toISOString(), compiled: res.ok };
    if (!res.ok) {
      entry.error = String(body?.error?.message ?? '').slice(0, 200);
      refused++;
    }
    file.schemas[sha] = entry;
    console.log(`${name}: ${sha.slice(0, 12)}… ${res.ok ? 'compiled' : `REFUSED: ${entry.error}`}`);
  }
  if (!DRY) fs.writeFileSync(FILE, `${JSON.stringify(file, null, 2)}\n`);
  process.exit(refused > 0 ? 1 : 0);
})();
