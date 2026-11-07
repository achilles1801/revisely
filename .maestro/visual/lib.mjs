// Visual regression for the E2E flows (.maestro/README.md, "Screenshots"): the
// screenshots the flows take (subflows/shot.yaml) against approved baselines in
// .maestro/baselines/<platform>/<name>.png.
//
// A capture is normalised before it is compared or approved: the system status
// bar cropped off, what still varies between runs masked (screens.mjs), and
// halved (each pixel the mean of a 2×2 block), which keeps the baselines small
// and still shows a changed character.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { PLATFORMS, SCREEN_MASKS, PENDING, MATCH } from './screens.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const BASELINES = path.join(ROOT, '.maestro/baselines');

/** Masked areas are filled with this, in the baseline and the capture alike. */
const MASK = [236, 72, 153];

export function readPng(file) {
  return PNG.sync.read(fs.readFileSync(file));
}

/** Opaque RGB, best compression: screenshots have no transparency. */
export function encodePng(png) {
  return PNG.sync.write(png, { colorType: 2, inputColorType: 6, deflateLevel: 9, filterType: -1 });
}

export function writePng(file, png) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, encodePng(png));
}

function blank(width, height, rgb = [255, 255, 255]) {
  const png = new PNG({ width, height });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = rgb[0];
    png.data[i + 1] = rgb[1];
    png.data[i + 2] = rgb[2];
    png.data[i + 3] = 255;
  }
  return png;
}

/**
 * The masks for a screen on a platform, in the raw capture's pixels: the
 * platform's own (the E2E status line's clock) and the screen's. A negative y
 * counts from the bottom edge.
 */
export function masksFor(platform, name) {
  const own = SCREEN_MASKS[name]?.[platform] ?? [];
  return [...PLATFORMS[platform].masks, ...own];
}

/** Crop, mask and halve a raw capture (see the top of this file). */
export function normalise(raw, platform, name) {
  const p = PLATFORMS[platform];
  if (!p) throw new Error(`Unknown platform ${platform}`);
  const top = Math.min(p.top, raw.height);
  const width = raw.width;
  const height = raw.height - top;
  const src = Buffer.from(raw.data.subarray(top * width * 4));
  for (const m of masksFor(platform, name)) {
    const y0raw = m.y < 0 ? raw.height + m.y : m.y;
    const x0 = Math.max(0, m.x);
    const x1 = Math.min(width, m.x + m.w);
    const y0 = Math.max(0, y0raw - top);
    const y1 = Math.min(height, y0raw + m.h - top);
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * width + x) * 4;
        src[i] = MASK[0];
        src[i + 1] = MASK[1];
        src[i + 2] = MASK[2];
        src[i + 3] = 255;
      }
    }
  }
  const f = p.scale;
  const w = Math.floor(width / f);
  const h = Math.floor(height / f);
  const out = new PNG({ width: w, height: h });
  const n = f * f;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let dy = 0; dy < f; dy++) {
        for (let dx = 0; dx < f; dx++) {
          const i = ((y * f + dy) * width + (x * f + dx)) * 4;
          // Over white: a capture is opaque, but be safe with alpha.
          const a = src[i + 3] / 255;
          r += src[i] * a + 255 * (1 - a);
          g += src[i + 1] * a + 255 * (1 - a);
          b += src[i + 2] * a + 255 * (1 - a);
        }
      }
      const o = (y * w + x) * 4;
      out.data[o] = Math.round(r / n);
      out.data[o + 1] = Math.round(g / n);
      out.data[o + 2] = Math.round(b / n);
      out.data[o + 3] = 255;
    }
  }
  return out;
}

/** Why a screen has no baseline on purpose (being redesigned), or null. */
export function pendingReason(name) {
  const hit = PENDING.find((p) => p.pattern.test(name));
  return hit ? hit.reason : null;
}

/**
 * The capture of each screen on a platform under `dir` (the flows' results,
 * or a downloaded screens artifact): …/<platform>/<flow>[-retryN]/run/…/
 * takeScreenshot/<name>.png. Of a flow's attempts, the last one that took it.
 */
export function findCaptures(dir, platform) {
  const found = new Map();
  const walk = (d) => {
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.png') && path.basename(d) === 'takeScreenshot') {
        const parts = full.split(path.sep);
        const at = parts.lastIndexOf(platform);
        if (at < 0 || at + 1 >= parts.length) continue;
        const attemptDir = parts[at + 1];
        const m = /^(.*?)(?:-retry(\d+))?$/.exec(attemptDir);
        const flow = m[1];
        const attempt = Number(m[2] ?? 0);
        const name = e.name.replace(/\.png$/, '');
        const prev = found.get(name);
        if (!prev || attempt > prev.attempt) found.set(name, { name, flow, attempt, file: full });
      }
    }
  };
  walk(dir);
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function baselinePath(platform, name) {
  return path.join(BASELINES, platform, `${name}.png`);
}

/**
 * A normalised capture against its baseline. `pixels` is how many pixels
 * differ by more than MATCH.threshold (pixelmatch's colour distance, 0–1),
 * anti-aliasing left out; more than MATCH.maxPixels is a change.
 */
export function compareImages(base, cur) {
  if (base.width !== cur.width || base.height !== cur.height) {
    return { status: 'size', pixels: null, diff: null, box: null };
  }
  const { width, height } = base;
  const diff = new PNG({ width, height });
  const pixels = pixelmatch(base.data, cur.data, diff.data, width, height, {
    threshold: MATCH.threshold,
    includeAA: false,
    alpha: 0.25,
    diffColor: [230, 0, 0],
    aaColor: [255, 210, 0],
  });
  let box = null;
  if (pixels > 0) {
    let x0 = width;
    let y0 = height;
    let x1 = -1;
    let y1 = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        if (diff.data[i] === 230 && diff.data[i + 1] === 0 && diff.data[i + 2] === 0) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    if (x1 >= 0) box = { x0, y0, x1, y1 };
  }
  return { status: pixels > MATCH.maxPixels ? 'changed' : 'same', pixels, diff, box };
}

function blit(dst, src, ox, oy) {
  for (let y = 0; y < src.height; y++) {
    const s = y * src.width * 4;
    src.data.copy(dst.data, ((oy + y) * dst.width + ox) * 4, s, s + src.width * 4);
  }
}

function rect(png, ox, oy, box, rgb, thickness = 3) {
  const pad = 6;
  const x0 = Math.max(0, box.x0 - pad) + ox;
  const y0 = Math.max(0, box.y0 - pad) + oy;
  const x1 = Math.min(png.width - 1, box.x1 + pad + ox);
  const y1 = Math.min(png.height - 1, box.y1 + pad + oy);
  const put = (x, y) => {
    if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
    const i = (y * png.width + x) * 4;
    png.data[i] = rgb[0];
    png.data[i + 1] = rgb[1];
    png.data[i + 2] = rgb[2];
    png.data[i + 3] = 255;
  };
  for (let t = 0; t < thickness; t++) {
    for (let x = x0; x <= x1; x++) {
      put(x, y0 - t);
      put(x, y1 + t);
    }
    for (let y = y0; y <= y1; y++) {
      put(x0 - t, y);
      put(x1 + t, y);
    }
  }
}

/**
 * Side by side: the baseline, this run's capture, and the differences (red on
 * a faded baseline), with the changed area outlined on all three. A missing
 * panel (a size change) is left blank.
 */
export function board(base, cur, diff, box) {
  const gap = 24;
  const panels = [base, cur, diff].filter(Boolean);
  const w = panels.reduce((s, p) => s + p.width, 0) + gap * (panels.length + 1);
  const h = Math.max(...panels.map((p) => p.height)) + gap * 2;
  const out = blank(w, h, [120, 120, 128]);
  let x = gap;
  for (const p of panels) {
    blit(out, p, x, gap);
    if (box && p.width === panels[0].width) rect(out, x, gap, box, [230, 0, 0]);
    x += p.width + gap;
  }
  return out;
}
