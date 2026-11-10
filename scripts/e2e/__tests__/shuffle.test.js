const { execFileSync } = require('child_process');
const path = require('path');
const { shuffle } = require('../../../.maestro/scripts/shuffle');

const flows = Array.from({ length: 21 }, (_, i) => `.maestro/flows/${String(i + 1).padStart(2, '0')}-x.yaml`);

it('gives the same order for the same seed, so a failing order can be run again', () => {
  expect(shuffle(flows, '42687083053')).toEqual(shuffle(flows, '42687083053'));
});

it('keeps every flow exactly once', () => {
  expect([...shuffle(flows, 'nightly')].sort()).toEqual([...flows].sort());
});

it('gives other orders for other seeds', () => {
  const orders = new Set(['1', '2', '3', '4', '5'].map((s) => shuffle(flows, s).join(' ')));
  expect(orders.size).toBe(5);
  expect(shuffle(flows, '1')).not.toEqual(flows);
});

it('prints one flow a line from the command line, as run.sh reads it', () => {
  const script = path.join(__dirname, '..', '..', '..', '.maestro', 'scripts', 'shuffle.js');
  const out = execFileSync('node', [script, 'seed', 'a.yaml', 'b.yaml', 'c.yaml'], { encoding: 'utf8' });
  expect(out.trim().split('\n')).toEqual(shuffle(['a.yaml', 'b.yaml', 'c.yaml'], 'seed'));
});
