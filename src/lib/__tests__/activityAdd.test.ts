import { UndoQueue, memorizeSuggestion, missedFromSession, pagesToUnmark } from '../activityAdd';

const M = new Set([549, 550, 551, 552, 553, 556, 557, 600]);

describe('the add menu’s rules (C4)', () => {
  it('“From your session” offers only the skipped pages the session missed', () => {
    expect(missedFromSession({ pagesRevised: [549, 550], pagesSkipped: [556, 557, 550] }, M)).toEqual([556, 557]);
  });

  it('a skipped page that isn’t memorized is not suggested', () => {
    expect(missedFromSession({ pagesRevised: [], pagesSkipped: [1, 556] }, M)).toEqual([556]);
  });

  it('the Memorized suggestion is the pages read that aren’t memorized yet', () => {
    expect(memorizeSuggestion([600, 601, 601, 602], M)).toEqual([601, 602]);
  });

  it('removing a memorization un-marks only the pages still memorized', () => {
    expect(pagesToUnmark([549, 999, 549], M)).toEqual([549]);
  });
});

describe('deletes that can be undone', () => {
  function fakeTimers() {
    let now = 0;
    const jobs: { at: number; fn: () => void; id: number; cancelled: boolean }[] = [];
    let id = 0;
    return {
      timers: {
        setTimeout: (fn: () => void, ms: number) => {
          const job = { at: now + ms, fn, id: ++id, cancelled: false };
          jobs.push(job);
          return job;
        },
        clearTimeout: (t: unknown) => {
          (t as { cancelled: boolean }).cancelled = true;
        },
      },
      advance(ms: number) {
        now += ms;
        for (const j of jobs) if (!j.cancelled && j.at <= now && !(j as { done?: boolean }).done) {
          (j as { done?: boolean }).done = true;
          j.fn();
        }
      },
    };
  }

  it('a delete is committed after the undo window, unless undone', () => {
    const f = fakeTimers();
    const q = new UndoQueue(f.timers);
    const commit = jest.fn();
    q.schedule('note-1', commit, 5000);
    expect(q.pending('note-1')).toBe(true);
    f.advance(4999);
    expect(commit).not.toHaveBeenCalled();
    f.advance(1);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(q.pending('note-1')).toBe(false);
  });

  it('undo keeps the item: nothing is committed', () => {
    const f = fakeTimers();
    const q = new UndoQueue(f.timers);
    const commit = jest.fn();
    q.schedule('note-1', commit, 5000);
    expect(q.undo('note-1')).toBe(true);
    f.advance(10_000);
    expect(commit).not.toHaveBeenCalled();
    expect(q.undo('note-1')).toBe(false);
  });

  it('flush commits every held delete at once', () => {
    const f = fakeTimers();
    const q = new UndoQueue(f.timers);
    const a = jest.fn();
    const b = jest.fn();
    q.schedule('a', a);
    q.schedule('b', b);
    q.flush();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });
});
