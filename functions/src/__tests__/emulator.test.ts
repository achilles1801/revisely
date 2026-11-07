// The functions emulator's stand-ins (emulator.ts): off everywhere but the emulator with a demo
// project, and the recorded Anthropic replies made with the requests our functions send now.
import { readFileSync } from 'fs';
import { join } from 'path';
import { buildCoachRequest } from '../coach/prompt';
import { buildAskRequest, buildReviewRequest } from '../revo/prompt';
import { driftOf, inTestEmulator, kindOf, Recording, shortRequest, testNow } from '../emulator';
import type { RevoContext } from '../revo/types';

const recording = (name: string): Recording =>
  JSON.parse(readFileSync(join(__dirname, '..', '..', 'test-recordings', 'anthropic', `${name}.json`), 'utf8'));

const context: RevoContext = {
  totals: {
    memorizedPages: 1,
    revisedWithin7Days: 0,
    revisedWithin30Days: 0,
    daysWithSession30: 0,
    streakDays: 0,
    sessions30: 0,
    weakPages: 0,
    moderatePages: 0,
    strongPages: 0,
    weakRevisedLast7Days: 0,
    pagesPerDay7: 0,
    pagesPerDay30: 0,
    plannedPerDay: 1,
  },
  today: { plannedPages: 1, revisedPages: 0, minutes: 0, memorizedPages: 0, nextPages: [], weakNext: [], done: false },
  weakPages: [],
  week: [],
  localTime: null,
};

describe('inTestEmulator', () => {
  it('is on only in the functions emulator with a demo- project', () => {
    expect(inTestEmulator({ FUNCTIONS_EMULATOR: 'true', GCLOUD_PROJECT: 'demo-revisely' })).toBe(true);
    // Deployed: no FUNCTIONS_EMULATOR, the real project.
    expect(inTestEmulator({ GCLOUD_PROJECT: 'revision-buddy-3a398' })).toBe(false);
    // The emulator pointed at the real project (someone's laptop): still off.
    expect(inTestEmulator({ FUNCTIONS_EMULATOR: 'true', GCLOUD_PROJECT: 'revision-buddy-3a398' })).toBe(false);
    expect(inTestEmulator({ FUNCTIONS_EMULATOR: 'false', GCLOUD_PROJECT: 'demo-revisely' })).toBe(false);
    expect(inTestEmulator({})).toBe(false);
  });

  it('takes no test clock outside the emulator', () => {
    const saved = { ...process.env };
    try {
      delete process.env.FUNCTIONS_EMULATOR;
      process.env.GCLOUD_PROJECT = 'revision-buddy-3a398';
      expect(testNow({ 'x-revisely-test-now': '1800000000000' })).toBeNull();
      process.env.FUNCTIONS_EMULATOR = 'true';
      process.env.GCLOUD_PROJECT = 'demo-revisely';
      expect(testNow({ 'x-revisely-test-now': '1800000000000' })).toBe(1800000000000);
      expect(testNow({ 'x-revisely-test-now': 'soon' })).toBeNull();
      expect(testNow({})).toBeNull();
    } finally {
      process.env = saved;
    }
  });
});

describe('the recorded replies', () => {
  const requests = {
    'revo-ask': buildAskRequest({ day: '2026-11-03', question: 'How was my week?', context, attach: null, memory: [], history: [], chat: null }),
    'revo-review': buildReviewRequest({ day: '2026-11-03', context, memory: [] }),
    coach: buildCoachRequest('pace', { pagesPerDay7: 1, pagesPerDay30: 1, plannedPerDay: 1 }),
  } as const;

  it.each(Object.keys(requests) as (keyof typeof requests)[])('%s is answered by its own recording', (name) => {
    expect(kindOf(requests[name])).toBe(name);
  });

  // A request our functions send now that its recording wasn't made with (another model, max_tokens,
  // thinking, system prompt): record it again (functions/scripts/record-anthropic.js, TESTING.md),
  // so the tests run on what Anthropic answers to the request we really send.
  it.each(Object.keys(requests) as (keyof typeof requests)[])('%s was recorded with the request the functions send now', (name) => {
    expect(driftOf(shortRequest(requests[name]), recording(name).request)).toEqual([]);
  });

  it.each(Object.keys(requests) as (keyof typeof requests)[])('%s is a Messages API reply with text and usage', (name) => {
    const r = recording(name);
    expect(r.status).toBe(200);
    const body = r.body as { type: string; content: { type: string; text?: string }[]; usage: Record<string, number>; stop_reason: string };
    expect(body.type).toBe('message');
    expect(body.content.some((c) => c.type === 'text' && (c.text ?? '').trim() !== '')).toBe(true);
    expect(body.stop_reason).toBe('end_turn');
    for (const k of ['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens']) {
      expect(typeof body.usage[k]).toBe('number');
    }
  });
});
