import manifestJson from './bench.manifest.json';
import { parseManifest } from '../bench';
import { selfCheckFromFailedOpen, selfCheckFromInfo, selfCheckFromOpen, selfCheckRun } from '../selfCheck';

const INFO = {
  pack: '9dd74eec9a576643',
  self_check: {
    ran: true,
    ok: true,
    max_diff: 0.000042,
    ort: '1.31.1',
    models: {
      v7: { ran: true, ok: true, max_diff: 0.000042, top_diff: 0, frames: 240, not_finite: 0, tol: 0.001, prepacking: false },
      v5: { ran: false, prepacking: true },
    },
  },
};

describe('[ONDEV-1] the engine self-check a device reports', () => {
  it('reads rc_info: both models, the pack, ONNX Runtime and prepacking', () => {
    const c = selfCheckFromInfo(INFO, 'abc');
    expect(c).toMatchObject({ ran: true, ok: true, pack: '9dd74eec9a576643', packId: 'abc', ort: '1.31.1', openCode: null });
    expect(c.v7).toEqual({ ran: true, ok: true, maxDiff: 0.000042, topDiff: 0, frames: 240, notFinite: 0, tol: 0.001, prepacking: false });
    expect(c.v5).toEqual({ ran: false, ok: null, maxDiff: null, topDiff: null, frames: null, notFinite: null, tol: null, prepacking: true }); // open, no check file
    expect(selfCheckFromInfo({ self_check: { ran: true, models: { v5: { ran: false } } } }, null).v5.prepacking).toBeNull(); // not open
  });

  it('never reads a missing or malformed check as a pass', () => {
    for (const info of [null, {}, { self_check: 'yes' }, { self_check: { ran: 1, ok: 'true' } }]) {
      const c = selfCheckFromInfo(info, null);
      expect(c.ran).toBe(false);
      expect(c.ok).toBeNull();
      expect(c.v7.ran).toBe(false);
    }
    const bad = selfCheckFromInfo({ self_check: { ran: true, ok: true, models: { v7: { ran: true, max_diff: 'x', top_diff: Infinity } } } }, null);
    expect(bad.v7).toMatchObject({ ran: true, ok: null, maxDiff: null, topDiff: null });
  });

  it('keeps what names the pack from pack-v3 on, and a failed check that left the engine open', () => {
    const c = selfCheckFromOpen(
      {
        ok: true,
        code: 0,
        info: JSON.stringify({
          pack: 'pack-v3',
          pack_content: '0123456789abcdef',
          self_check: { ran: true, ok: false, models: { v7: { ran: true, ok: false, max_diff: 5.9, top_diff: 12, frames: 240 }, v5: { ran: false } } },
        }),
      },
      'v7m-abc',
    );
    expect(c).toMatchObject({ ran: true, ok: false, pack: 'pack-v3', packContent: '0123456789abcdef', packId: 'v7m-abc', openCode: null });
    expect(c.v7).toMatchObject({ ok: false, maxDiff: 5.9, topDiff: 12 });
    expect(selfCheckFromInfo(INFO, 'abc').packContent).toBeNull();
  });

  it('keeps the code and error of an engine that refused to open', () => {
    const c = selfCheckFromFailedOpen(4, 'v7.check: max diff 5.9, 12 frames with another top sound', 'abc');
    expect(c).toMatchObject({ ran: false, ok: false, openCode: 4, packId: 'abc' });
    expect(c.openError).toContain('max diff 5.9');
    expect(selfCheckFromFailedOpen(4, 'x'.repeat(900), null).openError).toHaveLength(500);
  });

  it('reads what an open resolved to, and an unreadable answer as not known', () => {
    expect(selfCheckFromOpen({ ok: true, code: 0, info: JSON.stringify(INFO) }, 'v7m-1')).toMatchObject({ ok: true, packId: 'v7m-1' });
    expect(selfCheckFromOpen({ ok: false, code: -3, error: 'v7 check' }, 'v7m-1')).toMatchObject({ ok: false, openCode: -3, openError: 'v7 check' });
    expect(selfCheckFromOpen({ ok: true, code: 0, info: 'not json' }, 'v7m-1')).toMatchObject({ ran: false, ok: null });
  });

  it('goes into a record as a run of its own', () => {
    expect(selfCheckRun(selfCheckFromInfo(INFO, 'abc'))).toMatchObject({ mode: 'selfCheck', ok: true, pack: '9dd74eec9a576643' });
  });

  it('a Test Lab self-check names files the manifest has, each with room for its bytes', () => {
    const lab = (selfCheck: unknown, plans: unknown[] = [], longSec = 0) =>
      parseManifest({ ...manifestJson, testLab: { plans, windows: 1, longSec, selfCheck } })?.testLab;
    const blobs = [{ name: 'v7.weights.f16', file: 'f16pack', room: 82450624 }];
    expect(lab({ packId: 'v7m-1', blobs })?.selfCheck).toEqual({ packId: 'v7m-1', blobs });
    expect(lab({ packId: 'v7m-1', blobs: [{ ...blobs[0], file: 'nope' }] })).toBeUndefined();
    expect(lab({ packId: 'v7m-1', blobs: [{ ...blobs[0], room: 10 }] })).toBeUndefined();
    expect(lab({ packId: '', blobs })).toBeUndefined();
    expect(lab({ packId: 'v7m-1', blobs }, [], 60)).toBeUndefined(); // a long run needs a run to repeat
    expect(lab(undefined)).toBeUndefined(); // no runs and no self-check: nothing to do
  });

  it('a manifest can list the engine test’s clips, each with its golden’s start frame', () => {
    const takes = [
      { file: 'clip', start: { s: 78, a: 1, s2: 78, a2: 30, namesAfter: true, letters: true } },
      { file: 'take', start: { s: 1, a: 1, s2: 1, a2: 7, namesAfter: true } },
    ];
    const parsed = parseManifest({ ...manifestJson, takes })!;
    expect(parsed.takes).toEqual([
      { file: 'clip', start: expect.objectContaining({ type: 'start', s: 78, a: 1, s2: 78, a2: 30, mon: 4, mot: 4, aar: 0, letters: true, tajweed: false, namesAfter: true }) },
      { file: 'take', start: expect.objectContaining({ s: 1, a: 1, a2: 7, letters: true }) },
    ]);
    expect(parseManifest({ ...manifestJson, takes: [{ file: 'nope', start: { s: 1, a: 1 } }] })).toBeNull();
    expect(parseManifest({ ...manifestJson, takes: [{ file: 'clip', start: { s: 'x' } }] })).toBeNull();
    expect(parseManifest(manifestJson)!.takes).toBeUndefined();
  });
});
