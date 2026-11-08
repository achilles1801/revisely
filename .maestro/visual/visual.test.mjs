// node --test (npm test in .maestro/visual): the normalising, comparing and finding of captures.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import { compareImages, encodePng, findCaptures, masksFor, normalise, pendingReason } from './lib.mjs';
import { PLATFORMS, SCREEN_MASKS, MATCH, VARIANTS } from './screens.mjs';

const SIZE = { ios: [1206, 2622], android: [1080, 2400] };

function solid(width, height, rgb) {
  const png = new PNG({ width, height });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data.set([...rgb, 255], i);
  }
  return png;
}

function paint(png, x0, y0, w, h, rgb) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) png.data.set([...rgb, 255], (y * png.width + x) * 4);
  }
}

const at = (png, x, y) => [...png.data.subarray((y * png.width + x) * 4, (y * png.width + x) * 4 + 3)];

test('normalise crops the status bar, masks and halves', () => {
  const [w, h] = SIZE.ios;
  const raw = solid(w, h, [255, 255, 255]);
  paint(raw, 0, 0, w, PLATFORMS.ios.top, [0, 0, 0]); // the status bar: gone
  paint(raw, 0, h - 20, w, 20, [0, 0, 0]); // the E2E status line: masked
  const out = normalise(raw, 'ios', 'any');
  assert.equal(out.width, w / 2);
  assert.equal(out.height, Math.floor((h - PLATFORMS.ios.top) / 2));
  assert.deepEqual(at(out, 10, 0), [255, 255, 255]);
  assert.deepEqual(at(out, 10, out.height - 2), [236, 72, 153]);
});

test('a screen mask is applied in raw pixels, below the crop', () => {
  const name = '04-home-done';
  const [w, h] = SIZE.android;
  const a = normalise(solid(w, h, [255, 255, 255]), 'android', name);
  const raw = solid(w, h, [255, 255, 255]);
  for (const m of masksFor('android', name)) paint(raw, m.x, m.y < 0 ? h + m.y : m.y, m.w, m.h, [0, 0, 0]);
  const b = normalise(raw, 'android', name);
  assert.equal(compareImages(a, b).pixels, 0);
});

test('every mask lies inside its platform frame', () => {
  for (const [name, byPlatform] of Object.entries(SCREEN_MASKS)) {
    for (const [platform, masks] of Object.entries(byPlatform)) {
      const [w, h] = SIZE[platform];
      for (const m of masks) {
        const y = m.y < 0 ? h + m.y : m.y;
        assert.ok(m.x >= 0 && m.x + m.w <= w && y >= PLATFORMS[platform].top && y + m.h <= h, `${name} ${platform} ${m.why}`);
      }
    }
  }
});

test('the same screen is the same; a changed word is a change; another size is not compared', () => {
  const base = solid(300, 600, [250, 250, 250]);
  paint(base, 20, 20, 120, 16, [30, 30, 30]);
  assert.deepEqual(compareImages(base, base).status, 'same');

  const word = PNG.sync.read(encodePng(base));
  paint(word, 150, 20, 8, 16, [30, 30, 30]); // a few more letters
  const r = compareImages(base, word);
  assert.equal(r.status, 'changed');
  assert.ok(r.pixels > MATCH.maxPixels);
  assert.deepEqual(r.box, { x0: 150, y0: 20, x1: 157, y1: 35 });

  assert.equal(compareImages(base, solid(300, 500, [250, 250, 250])).status, 'size');
});

test('findCaptures takes the last attempt that took the screenshot', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'captures-'));
  const put = (rel) => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), encodePng(solid(4, 4, [0, 0, 0])));
  };
  put('android/02-revision-session/run/2026-11-07_010930/02-revision-session/takeScreenshot/02-home-done.png');
  put('android/02-revision-session-retry1/run/2026-11-07_011030/02-revision-session/takeScreenshot/02-home-done.png');
  put('android/02-revision-session/run/2026-11-07_010930/02-revision-session/takeScreenshot/02-session-page.png');
  put('ios/01-onboarding/run/x/01-onboarding/takeScreenshot/01-home-day-one.png');
  const found = findCaptures(dir, 'android');
  assert.deepEqual(
    found.map((c) => [c.name, c.flow, c.attempt]),
    [
      ['02-home-done', '02-revision-session', 1],
      ['02-session-page', '02-revision-session', 0],
    ],
  );
  fs.rmSync(dir, { recursive: true, force: true });
});

test('screens being redesigned have no baseline on purpose', () => {
  assert.match(pendingReason('07-activity-recording'), /Activity/);
  assert.match(pendingReason('r4-sheet'), /Revo/);
  assert.equal(pendingReason('02-home-done'), null);
});

test("every accent and theme variant of a Revo screen waits for approval", () => {
  assert.equal(VARIANTS.length, 6);
  for (const v of VARIANTS) assert.match(pendingReason(`r4-sheet${v}`), /Revo/, `r4-sheet${v}`);
  assert.equal(pendingReason('02-home-done-dark'), null);
});
