// Splits the scenario and property files across CI's shards by how long each takes
// (tests/scenarios/durations.json, seconds a file took in CI), so the shards finish together.
// Jest's own --shard splits by a hash of the path: the four shards took 2:45 to 9:11 (Nov 7 2026),
// and every PR and Preview waited for the slowest. Longest file first, each to the shard with the
// least so far; ties by path, so every shard computes the same split. A file not in the table
// counts as DEFAULT_SECONDS. Refresh the table from a CI run's logs when files are added or grow:
//   node tests/scenarios/harness/durations.js <run id>
const path = require('path');
const Sequencer = require('@jest/test-sequencer').default;
const durations = require('../durations.json');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_SECONDS = 30;

const cost = (test) => durations[path.relative(ROOT, test.path).split(path.sep).join('/')] ?? DEFAULT_SECONDS;

/** The tests of shard `index` (1-based) of `count`: longest first, each to the lightest shard. */
function split(tests, index, count) {
  const sorted = [...tests].sort((a, b) => cost(b) - cost(a) || a.path.localeCompare(b.path));
  const shards = Array.from({ length: count }, () => ({ seconds: 0, tests: [] }));
  for (const test of sorted) {
    const lightest = shards.reduce((min, s) => (s.seconds < min.seconds ? s : min));
    lightest.tests.push(test);
    lightest.seconds += cost(test);
  }
  return shards[index - 1].tests;
}

class BalancedSequencer extends Sequencer {
  shard(tests, { shardIndex, shardCount }) {
    return split(tests, shardIndex, shardCount);
  }
}

module.exports = BalancedSequencer;
module.exports.split = split;
