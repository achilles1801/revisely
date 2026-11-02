// A pause in the reciter's voice, from the microphone's level (iOS metering:
// average power in dBFS, -160 silence … 0 full scale), for the hidden recite
// mode: reciting a verse, then pausing, shows that verse. A guess from loudness
// alone (no recognition): reciters pause at the ends of verses, and the next
// verse is shown each time, so a breath in a long verse shows it a little
// early, and two verses without a pause need a tap.

export interface PauseDetectorOptions {
  /** Voice: this many dB above the room's floor. */
  aboveFloorDb: number;
  /** Never voice below this level (dBFS). */
  minVoiceDb: number;
  /** Voice needed before a pause counts (ms): a cough or a word isn't a verse. */
  minVoiceMs: number;
  /** Quiet after voice that is a pause (ms). */
  pauseMs: number;
  /** The floor is the quietest level over this long (ms). */
  floorWindowMs: number;
}

export const PAUSE_DEFAULTS: PauseDetectorOptions = {
  aboveFloorDb: 10,
  minVoiceDb: -55,
  minVoiceMs: 1000,
  pauseMs: 1100,
  floorWindowMs: 5000,
};

export interface PauseDetector {
  /** One level reading at time `t` (ms). True when it ends a pause after voice. */
  feed(db: number, t: number): boolean;
  /** Whether the last reading was voice (for a "hearing you" cue). */
  readonly voice: boolean;
  reset(): void;
}

export function createPauseDetector(options: Partial<PauseDetectorOptions> = {}): PauseDetector {
  const o = { ...PAUSE_DEFAULTS, ...options };
  let readings: { t: number; db: number }[] = [];
  let lastT: number | null = null;
  let voiceMs = 0;
  let quietMs = 0;
  let voice = false;

  return {
    feed(db: number, t: number): boolean {
      if (!Number.isFinite(db)) db = -160;
      const dt = lastT == null ? 0 : Math.max(0, Math.min(t - lastT, 500));
      lastT = t;
      readings.push({ t, db });
      while (readings.length > 1 && readings[0].t < t - o.floorWindowMs) readings.shift();
      const floor = Math.min(...readings.map((r) => r.db));
      voice = db >= o.minVoiceDb && db >= floor + o.aboveFloorDb;
      if (voice) {
        voiceMs += dt;
        quietMs = 0;
        return false;
      }
      quietMs += dt;
      if (quietMs < o.pauseMs) return false;
      const wasVerse = voiceMs >= o.minVoiceMs;
      voiceMs = 0;
      return wasVerse;
    },
    get voice() {
      return voice;
    },
    reset() {
      readings = [];
      lastT = null;
      voiceMs = 0;
      quietMs = 0;
      voice = false;
    },
  };
}
