// A take's own numbers on the phone (Revisely Dev's long takes, Nov 20 2026): how long the JavaScript thread stalled,
// how long an event took from arriving to being applied, and how far behind the checker was. Majd's 3.5-minute take of
// Nov 19 lagged and was lost, and nothing said whether the phone or the checker fell behind. These say it for every
// take: they go with a take that ends badly (lib/reciteLive/takeReport) and with each long one.
//
// Numbers only: no audio, no words, no ids beyond the checker's take id.

/** The heartbeat's interval (ms); a gap past it is the JavaScript thread stalled. */
export const STATS_BEAT_MS = 250;
/** A stall at least this long counts as one (ms). */
const STALL_COUNTS_MS = 250;

export interface TakeStats {
  /** Seconds of the take's audio heard. */
  secs: number;
  /** The longest JavaScript stall (ms past the heartbeat's interval), and how many stalls of 250 ms or more. */
  stallMax: number;
  stalls: number;
  /** The checker's events, and its heartbeats (`beat`). */
  events: number;
  beats: number;
  /** From an event's arrival to the screen applying it (ms): the longest, and the average. */
  applyMax: number;
  applyAvg: number;
  /**
   * How far behind the checker was (s): the audio the phone had sent minus the audio time of the checker's latest
   * cursor or heartbeat. The longest, and the last. Null until an event carried a time.
   */
  lagMax: number | null;
  lagLast: number | null;
  /** The longest silence from the checker while the take was live (ms). */
  quietMax: number;
  /** The JavaScript heap (MB, Hermes) at the start, its most, and at the end; null where the engine doesn't say. */
  heapStart: number | null;
  heapMax: number | null;
  heapEnd: number | null;
}

export interface TakeStatsDeps {
  now: () => number;
  /** The JavaScript heap's size in bytes, or null. */
  heap?: () => number | null;
  every: (fn: () => void, ms: number) => unknown;
  clear: (h: unknown) => void;
}

export interface TakeStatsTracker {
  /** The take began: the heartbeat starts. */
  start(): void;
  /** An event arrived, with the seconds of audio sent so far; `replayed`: a re-check's, whose times start again from 0. */
  event(e: { type: string; t?: number }, sentSecs: number, replayed?: boolean): void;
  /** Events that arrived at `arrivedAt` were applied now. */
  applied(arrivedAt: number): void;
  /** The take ended: the heartbeat stops (the numbers stay). */
  stop(secs: number): void;
  snapshot(): TakeStats;
}

export function createTakeStats(deps: TakeStatsDeps): TakeStatsTracker {
  let beat: unknown = null;
  let lastBeat = 0;
  let lastHeard = 0;
  let s: TakeStats = blank();
  let applyTotal = 0;
  let applyCount = 0;

  function blank(): TakeStats {
    return {
      secs: 0,
      stallMax: 0,
      stalls: 0,
      events: 0,
      beats: 0,
      applyMax: 0,
      applyAvg: 0,
      lagMax: null,
      lagLast: null,
      quietMax: 0,
      heapStart: null,
      heapMax: null,
      heapEnd: null,
    };
  }
  /** The heap now, in MB (one decimal), or null. */
  const heapMb = (): number | null => {
    try {
      const b = deps.heap?.();
      return b == null ? null : Math.round(b / 104_857.6) / 10;
    } catch {
      return null;
    }
  };
  let beats = 0;
  const stopBeat = () => {
    if (beat != null) deps.clear(beat);
    beat = null;
  };

  return {
    start() {
      stopBeat();
      s = blank();
      applyTotal = 0;
      applyCount = 0;
      lastBeat = deps.now();
      lastHeard = lastBeat;
      beats = 0;
      s.heapStart = heapMb();
      s.heapMax = s.heapStart;
      beat = deps.every(() => {
        const now = deps.now();
        const stall = now - lastBeat - STATS_BEAT_MS;
        if (stall > s.stallMax) s.stallMax = stall;
        if (stall >= STALL_COUNTS_MS) s.stalls++;
        lastBeat = now;
        // The heap every 5 s.
        if (++beats % 20 === 0) {
          const mb = heapMb();
          if (mb != null) s.heapMax = s.heapMax == null ? mb : Math.max(s.heapMax, mb);
        }
      }, STATS_BEAT_MS);
    },
    event(e, sentSecs, replayed = false) {
      const now = deps.now();
      if (beat != null) s.quietMax = Math.max(s.quietMax, now - lastHeard);
      lastHeard = now;
      if (e.type === 'beat') s.beats++;
      else s.events++;
      if (!replayed && (e.type === 'at' || e.type === 'beat') && typeof e.t === 'number') {
        const lag = Math.max(0, Math.round((sentSecs - e.t) * 10) / 10);
        s.lagLast = lag;
        s.lagMax = s.lagMax == null ? lag : Math.max(s.lagMax, lag);
      }
    },
    applied(arrivedAt) {
      const ms = Math.max(0, deps.now() - arrivedAt);
      s.applyMax = Math.max(s.applyMax, ms);
      applyTotal += ms;
      applyCount++;
      s.applyAvg = Math.round(applyTotal / applyCount);
    },
    stop(secs) {
      if (beat != null) {
        s.heapEnd = heapMb();
        if (s.heapEnd != null) s.heapMax = s.heapMax == null ? s.heapEnd : Math.max(s.heapMax, s.heapEnd);
      }
      stopBeat();
      s.secs = Math.max(s.secs, Math.round(secs));
    },
    snapshot: () => ({ ...s }),
  };
}
