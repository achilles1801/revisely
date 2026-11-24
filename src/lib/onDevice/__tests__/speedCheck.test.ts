import {
  coolAndFull,
  demotedOff,
  effectiveHop,
  fastEnoughFrom,
  fellBehind,
  hopFor,
  isSettled,
  KeeperDeps,
  parseSpeedRecord,
  runSpeedCheck,
  SPEED,
  speedKeeper,
  speedKey,
  SpeedDeps,
} from '../speedCheck';

/** A phone whose calls take these times in turn (the last repeats), on a clock the check's own sleeps move. */
function phone(times: number[] | ((i: number) => number), over: Partial<SpeedDeps> = {}) {
  let t = 0;
  let i = 0;
  const gaps: number[] = [];
  let last: number | null = null;
  const deps: SpeedDeps = {
    probe: async () => {
      if (last != null) gaps.push(t - last);
      last = t;
      const ms = typeof times === 'function' ? times(i) : times[Math.min(i, times.length - 1)];
      i++;
      t += ms;
      return ms;
    },
    calm: () => true,
    now: () => t,
    sleep: async (ms) => {
      t += ms;
    },
    ...over,
  };
  return { deps, calls: () => i, gaps };
}

describe('hopFor', () => {
  it.each([
    [71, 0.5],
    [168, 0.5],
    [249.9, 0.5],
    [250, 1],
    [334, 1],
    [400, 1],
    [400.1, null],
    [650, null],
  ])('%d ms at p95: %s', (p95, hop) => {
    expect(hopFor(p95)).toBe(hop);
  });
});

describe('isSettled', () => {
  const flat = (n: number, v = 200) => Array.from({ length: n }, () => v);

  it('needs two whole blocks', () => {
    expect(isSettled(flat(11))).toBe(false);
    expect(isSettled(flat(12))).toBe(true);
    expect(isSettled(flat(13))).toBe(false);
    expect(isSettled(flat(18))).toBe(true);
  });

  it('two blocks more than 10% apart have not settled', () => {
    expect(isSettled([...flat(6, 300), ...flat(6, 220)])).toBe(false);
    expect(isSettled([...flat(6, 240), ...flat(6, 220)])).toBe(true);
  });
});

describe('[ONDEV-4] runSpeedCheck', () => {
  it('a steady phone: 12 calls to warm up, 24 timed, and the hop', async () => {
    const p = phone([70]);
    expect(await runSpeedCheck(p.deps)).toEqual({ kept: true, p95: 70, hop: 0.5, calls: 36 });
    expect(p.calls()).toBe(36);
  });

  it('spaces its calls as a live take does, however long each takes', async () => {
    const p = phone([120]);
    await runSpeedCheck(p.deps);
    expect(new Set(p.gaps)).toEqual(new Set([SPEED.spacingMs]));
  });

  it('warms up past a slow start', async () => {
    const p = phone((i) => (i < 12 ? 420 : 300));
    const r = await runSpeedCheck(p.deps);
    expect(r).toMatchObject({ kept: true, p95: 300, hop: 1 });
  });

  it('a phone that never settles keeps no result', async () => {
    const p = phone((i) => (Math.floor(i / 6) % 2 ? 150 : 300));
    expect(await runSpeedCheck(p.deps)).toEqual({ kept: false, why: 'unsettled' });
    expect(p.calls()).toBe(SPEED.maxWarmup);
  });

  it('a high first reading is timed three more times, and the last block decides', async () => {
    // Settled in its warm-up at 450, 450 for two blocks, then 300.
    const p = phone((i) => (i < 12 + 48 ? 450 : 300));
    expect(await runSpeedCheck(p.deps)).toEqual({ kept: true, p95: 300, hop: 1, calls: 12 + 96 });
  });

  it('one lucky block among high ones does not clear a slow phone', async () => {
    // 450 throughout, but for the third timed block.
    const p = phone((i) => (i >= 12 + 48 && i < 12 + 72 ? 230 : 450));
    expect(await runSpeedCheck(p.deps)).toEqual({ kept: true, p95: 450, hop: null, calls: 12 + 96 });
  });

  it('a first reading under the line needs no second block', async () => {
    const p = phone([380]);
    expect(await runSpeedCheck(p.deps)).toEqual({ kept: true, p95: 380, hop: 1, calls: 12 + 24 });
  });

  it('a phone slow in all four blocks goes to the server', async () => {
    const p = phone([640]);
    expect(await runSpeedCheck(p.deps)).toEqual({ kept: true, p95: 640, hop: null, calls: 12 + 96 });
  });

  it('stops at once when the phone is no longer calm, and keeps nothing', async () => {
    let n = 0;
    const p = phone([70], { calm: () => ++n < 20 });
    expect(await runSpeedCheck(p.deps)).toEqual({ kept: false, why: 'disturbed' });
    expect(p.calls()).toBeLessThan(12);
  });

  it('a suspension while timing keeps nothing', async () => {
    const p = phone((i) => (i === 20 ? 9000 : 70));
    expect(await runSpeedCheck(p.deps)).toEqual({ kept: false, why: 'disturbed' });
  });

  it('an engine that cannot probe keeps nothing', async () => {
    const p = phone([70], { probe: async () => null });
    expect(await runSpeedCheck(p.deps)).toEqual({ kept: false, why: 'no-probe' });
  });
});

describe('what is kept', () => {
  it('only a cool phone with no power saving counts', () => {
    expect(coolAndFull({ thermal: 'nominal' })).toBe(true);
    expect(coolAndFull({ thermal: 'none', lowPower: false })).toBe(true);
    expect(coolAndFull({ thermal: 'fair' })).toBe(true);
    expect(coolAndFull({ thermal: 'light' })).toBe(false);
    expect(coolAndFull({ thermal: 'serious' })).toBe(false);
    expect(coolAndFull({ thermal: 'nominal', lowPower: true })).toBe(false);
  });

  it('a result counts only for its own pack, engine, device and threads', () => {
    const key = speedKey({ pack: 'p1', version: 'e1' }, 'iPhone19,3', 2);
    const record = { key, p95: 71, hop: 0.5 as const };
    expect(fastEnoughFrom(record, key)).toBe(true);
    expect(fastEnoughFrom({ ...record, p95: 500, hop: null }, key)).toBe(false);
    expect(fastEnoughFrom(record, speedKey({ pack: 'p2', version: 'e1' }, 'iPhone19,3', 2))).toBeNull();
    expect(fastEnoughFrom(record, speedKey({ pack: 'p1', version: 'e1' }, 'iPhone19,3', 4))).toBeNull();
    expect(fastEnoughFrom(null, key)).toBeNull();
    expect(fastEnoughFrom(record, null)).toBeNull();
  });

  it('reads a stored result back, and nothing else', () => {
    expect(parseSpeedRecord(JSON.stringify({ key: 'k', p95: 300, hop: 0.5 }))).toEqual({ key: 'k', p95: 300, hop: 1 });
    expect(parseSpeedRecord('not json')).toBeNull();
    expect(parseSpeedRecord(JSON.stringify({ key: 'k' }))).toBeNull();
    expect(parseSpeedRecord(JSON.stringify({ key: 'k', p95: -1 }))).toBeNull();
    expect(parseSpeedRecord(null)).toBeNull();
  });
});

describe('[ONDEV-4] a take that fell behind', () => {
  it('means over 5% of its hops late, or over 2 s of lag', () => {
    expect(fellBehind({ hops: 100, late_hops: 5, max_lag_s: 0.2 })).toBe(false);
    expect(fellBehind({ hops: 100, late_hops: 6, max_lag_s: 0.2 })).toBe(true);
    expect(fellBehind({ hops: 100, late_hops: 0, max_lag_s: 2 })).toBe(false);
    expect(fellBehind({ hops: 100, late_hops: 0, max_lag_s: 2.1 })).toBe(true);
    expect(fellBehind(null)).toBe(false);
  });

  it('a slow hop in a short take proves nothing, but a long lag does', () => {
    expect(fellBehind({ hops: 10, late_hops: 2, max_lag_s: 0.2 })).toBe(false);
    expect(fellBehind({ hops: 10, late_hops: 0, max_lag_s: 3 })).toBe(true);
  });

  it('steps from 0.5 s to 1 s to the server, and no further', () => {
    const r = { key: 'k', p95: 80, hop: 0.5 as const };
    expect(effectiveHop(r)).toBe(0.5);
    expect(effectiveHop({ ...r, demoted: 1 })).toBe(1);
    expect(effectiveHop({ ...r, demoted: 2 })).toBeNull();
    expect(effectiveHop({ ...r, demoted: 9 })).toBeNull();
    expect(effectiveHop({ key: 'k', p95: 220, hop: 1, demoted: 1 })).toBeNull();
    expect(demotedOff({ ...r, demoted: 2 }, 'k')).toBe(true);
    expect(demotedOff({ ...r, demoted: 1 }, 'k')).toBe(false);
    expect(demotedOff({ key: 'k', p95: 500, hop: null }, 'k')).toBe(false);
  });

  it('a stored step down survives a relaunch', () => {
    expect(parseSpeedRecord(JSON.stringify({ key: 'k', p95: 80, hop: 0.5, demoted: 1 }))).toEqual({ key: 'k', p95: 80, hop: 0.5, demoted: 1 });
  });
});

describe('[ONDEV-4] speedKeeper', () => {
  const INFO = { pack: 'p1', version: 'e1', hop: 0.5, self_check: { models: { v7: { ran: true, ok: true } } } };
  const BAD = { hops: 100, late_hops: 50, max_lag_s: 3 };

  function setup(over: Partial<KeeperDeps> = {}, ms = 70, stored: string | null = null) {
    let t = 0;
    let due: (() => void) | null = null;
    const state = { info: INFO as ReturnType<KeeperDeps['info']>, active: true, thermal: 'nominal', stored, probes: 0, reopens: 0, ms };
    const k = speedKeeper({
      info: () => state.info,
      device: () => ({ model: 'iPhone19,3', thermal: state.thermal }),
      threads: 2,
      probe: async () => {
        state.probes++;
        t += state.ms;
        return state.ms;
      },
      active: () => state.active,
      read: async () => state.stored,
      write: async (json) => {
        state.stored = json;
      },
      reopen: () => {
        state.reopens++;
      },
      now: () => t,
      sleep: async (x) => {
        t += x;
      },
      later: (fn) => {
        due = fn;
        return fn;
      },
      cancel: () => {
        due = null;
      },
      ...over,
    });
    const idle = async () => {
      const fn = due;
      due = null;
      fn?.();
      for (let i = 0; i < 400; i++) await Promise.resolve();
    };
    return { k, state, idle, pending: () => due != null };
  }

  it('measures once when idle, keeps it, and answers from it', async () => {
    const t = setup();
    expect(t.k.fastEnough()).toBeNull();
    t.k.schedule();
    await t.idle();
    expect(t.k.fastEnough()).toBe(true);
    expect(t.k.hop()).toBe(0.5);
    expect(JSON.parse(t.state.stored as string)).toMatchObject({ p95: 70, hop: 0.5 });
    const probes = t.state.probes;
    t.k.schedule();
    await t.idle();
    expect(t.state.probes).toBe(probes);
  });

  it('a new launch reads the result and does not measure again', async () => {
    const first = setup();
    first.k.schedule();
    await first.idle();
    const next = setup({}, 70, first.state.stored);
    await next.k.load();
    expect(next.k.fastEnough()).toBe(true);
    next.k.schedule();
    await next.idle();
    expect(next.state.probes).toBe(0);
  });

  it('a new pack is measured again', async () => {
    const first = setup();
    first.k.schedule();
    await first.idle();
    first.state.info = { ...INFO, pack: 'p2' };
    expect(first.k.fastEnough()).toBeNull();
  });

  it('never measures with a take open, and a take stops a check under way', async () => {
    const t = setup();
    t.k.takeOpened();
    t.k.schedule();
    await t.idle();
    expect(t.state.probes).toBe(0);
    t.k.takeClosed();
    expect(t.pending()).toBe(true);
    let n = 0;
    const stopping = setup({
      probe: async () => {
        if (++n === 5) stopping.k.takeOpened();
        return 70;
      },
    });
    stopping.k.schedule();
    await stopping.idle();
    expect(n).toBe(5);
    expect(stopping.k.fastEnough()).toBeNull();
  });

  it.each([
    ['a warm phone', (s: { thermal: string }) => (s.thermal = 'serious')],
    ['the app in the background', (s: { active: boolean }) => (s.active = false)],
  ])('keeps nothing from %s', async (_n, change) => {
    const t = setup();
    change(t.state as never);
    t.k.schedule();
    await t.idle();
    expect(t.k.fastEnough()).toBeNull();
    expect(t.state.stored).toBeNull();
  });

  it('skips the recorded stand-in, and an engine that failed its self-check', async () => {
    for (const info of [{ ...INFO, version: 'recite-core replay' }, { ...INFO, self_check: { models: { v7: { ran: true, ok: false } } } }, { ...INFO, self_check: { models: { v7: { ran: false } } } }]) {
      const t = setup();
      t.state.info = info;
      t.k.schedule();
      await t.idle();
      expect(t.state.probes).toBe(0);
    }
  });

  it('a phone measured at 1 s reopens the engine at that hop, once', async () => {
    const t = setup({}, 300);
    t.k.schedule();
    await t.idle();
    expect(t.k.hop()).toBe(1);
    expect(t.state.reopens).toBe(0);
    t.k.schedule();
    await t.idle();
    expect(t.state.reopens).toBe(1);
    t.k.schedule();
    await t.idle();
    expect(t.state.reopens).toBe(1);
  });

  it('a take that fell behind slows the next one, never re-measures in the same run, and a later clean check clears it', async () => {
    const t = setup();
    t.k.schedule();
    await t.idle();
    t.k.noteTake(BAD);
    expect(t.k.hop()).toBe(1);
    expect(t.k.steps()).toBe(1);
    expect(t.k.fastEnough()).toBe(true);
    t.k.noteTake(BAD);
    expect(t.k.fastEnough()).toBe(false);
    expect(t.k.demoted()).toBe(true);
    t.k.noteTake(BAD); // already on the server
    expect(JSON.parse(t.state.stored as string).demoted).toBe(2);
    const probes = t.state.probes;
    t.k.schedule();
    await t.idle();
    expect(t.state.probes).toBe(probes);

    const next = setup({}, 70, t.state.stored);
    await next.k.load();
    expect(next.k.demoted()).toBe(true);
    next.k.schedule();
    await next.idle();
    expect(next.k.fastEnough()).toBe(true);
    expect(next.k.demoted()).toBe(false);
    expect(next.k.steps()).toBe(0);
  });

  it('a take that kept up changes nothing', async () => {
    const t = setup();
    t.k.schedule();
    await t.idle();
    t.k.noteTake({ hops: 100, late_hops: 0, max_lag_s: 0.2 });
    t.k.noteTake(null);
    expect(t.k.steps()).toBe(0);
  });
});
