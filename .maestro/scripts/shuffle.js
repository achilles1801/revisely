#!/usr/bin/env node
// The flows in an order given by a seed (run.sh, E2E_SHUFFLE): the nightly run's check that no flow
// leans on another having run before it on the same device or emulators. The same seed always gives
// the same order, so a failing order can be run again by hand (Run workflow, `shuffle`).
//
//   node .maestro/scripts/shuffle.js <seed> <flow.yaml> …   → the flows, one a line
'use strict';

/** A number from the seed's text (FNV-1a), so any seed (a run id, a word) works. */
function hash(seed) {
  let h = 0x811c9dc5;
  for (const ch of String(seed)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** mulberry32: a small seeded generator, numbers in [0, 1). */
function random(seed) {
  let a = hash(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A copy of `items` in the seed's order (Fisher–Yates). */
function shuffle(items, seed) {
  const next = random(seed);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

module.exports = { shuffle };

if (require.main === module) {
  const [seed, ...flows] = process.argv.slice(2);
  if (!seed) {
    console.error('usage: shuffle.js <seed> <flow.yaml> …');
    process.exit(2);
  }
  for (const flow of shuffle(flows, seed)) console.log(flow);
}
