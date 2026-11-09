// Points along Revo's R (revo/rMarkPath), evenly spaced by length: the pen tip of What's new's Revo
// moment follows them while the R writes itself. react-native-svg can't measure a path on the UI
// thread, so the outline is measured here once (its one subpath: absolute curves, then a close).

import { R_PATH } from '../revo/rMarkPath';

export interface PathTrace {
  /** The outline's length, in the path's own units. */
  length: number;
  xs: number[];
  ys: number[];
}

const NUMBER = /-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;
const STEPS_PER_CURVE = 48;

/** `count` points along `d` (M, C and Z commands, absolute), the first at its start and the last at its end. */
export function tracePath(d: string, count = 240): PathTrace {
  const poly: number[] = [];
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  for (const [, cmd, args] of d.matchAll(/([MCZ])([^MCZ]*)/g)) {
    const n = (args.match(NUMBER) ?? []).map(Number);
    if (cmd === 'M') {
      [x, y] = n;
      sx = x;
      sy = y;
      poly.push(x, y);
    } else if (cmd === 'C') {
      for (let i = 0; i + 5 < n.length; i += 6) {
        const [x1, y1, x2, y2, x3, y3] = n.slice(i, i + 6);
        for (let s = 1; s <= STEPS_PER_CURVE; s++) {
          const t = s / STEPS_PER_CURVE;
          const u = 1 - t;
          poly.push(
            u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
            u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
          );
        }
        x = x3;
        y = y3;
      }
    } else {
      poly.push(sx, sy);
      x = sx;
      y = sy;
    }
  }
  const at: number[] = [0];
  for (let i = 2; i < poly.length; i += 2) at.push(at[at.length - 1] + Math.hypot(poly[i] - poly[i - 2], poly[i + 1] - poly[i - 1]));
  const length = at[at.length - 1];
  const xs: number[] = [];
  const ys: number[] = [];
  let j = 0;
  for (let k = 0; k < count; k++) {
    const want = (length * k) / (count - 1);
    while (j < at.length - 2 && at[j + 1] < want) j++;
    const span = at[j + 1] - at[j] || 1;
    const f = Math.min(1, Math.max(0, (want - at[j]) / span));
    xs.push(Math.round((poly[2 * j] + (poly[2 * j + 2] - poly[2 * j]) * f) * 10) / 10);
    ys.push(Math.round((poly[2 * j + 1] + (poly[2 * j + 3] - poly[2 * j + 1]) * f) * 10) / 10);
  }
  return { length, xs, ys };
}

export const R_TRACE: PathTrace = tracePath(R_PATH);
