#!/usr/bin/env node
// Counts the coach's system prompt in tokens with the Messages API's count_tokens endpoint, to
// confirm it is above the 512-token cache minimum (functions/src/coach/prompt.ts). The owner runs
// it with the key in the environment; nothing is printed but the count.
//   ANTHROPIC_API_KEY=... node functions/scripts/count-coach-prompt.js
// The prompt is read from the compiled module (functions/lib) after `npm run build`.
const { COACH_SYSTEM_PROMPT, buildCoachRequest } = require('../lib/coach/prompt');
const { COACH_MODEL } = require('../lib/coach/pricing');

async function main() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    console.error('Set ANTHROPIC_API_KEY (the coach key) in the environment.');
    process.exit(1);
  }
  const body = {
    model: COACH_MODEL,
    system: [{ type: 'text', text: COACH_SYSTEM_PROMPT }],
    messages: buildCoachRequest('coverage', { memorizedPages: 1, revisedWithin7Days: 1, revisedWithin30Days: 1 }).messages,
  };
  const res = await fetch('https://api.anthropic.com/v1/messages/count_tokens', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error(`count_tokens failed: HTTP ${res.status}`);
    process.exit(1);
  }
  const { input_tokens } = await res.json();
  console.log(`system prompt + sample turn: ${input_tokens} tokens (cache minimum 512 for ${COACH_MODEL})`);
  process.exit(input_tokens >= 512 ? 0 : 2);
}
main();
