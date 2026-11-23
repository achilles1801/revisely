// The engine's load-time self-check, as the bench records it per device (Revisely Dev; BEHAVIOUR.md ONDEV-1). The 8-bit
// models turned out not to compute the same numbers everywhere, so each phone reports how far its v7 and v5 are from the
// pack's expected answers. Read from rc_info's `self_check`; an engine that refused to open has no rc_info, so its code
// and error text are kept instead. A failed check normally leaves the engine open with `ok: false`; only a model that won't
// load refuses the open. From pack-v3 rc_info names the pack (`pack`) and pins its bytes (`pack_content`). Older packs have
// neither, so the app's own pack id goes too: phones never load the lab's manifest.json, and that id changes with any file.

export interface ModelCheck {
  ran: boolean;
  ok: boolean | null;
  /** Largest absolute difference in log p. */
  maxDiff: number | null;
  /** Frames whose top sound differs, of `frames`. */
  topDiff: number | null;
  frames: number | null;
  /** NaN or infinite values: they have no difference to report, and fail the check. */
  notFinite: number | null;
  /** The bar in that model's check file. */
  tol: number | null;
  /** The setting the engine loaded this model with (ONNX Runtime can't report it back); null when it isn't open. */
  prepacking: boolean | null;
}

export interface SelfCheck {
  ran: boolean;
  ok: boolean | null;
  /** rc_info's `pack`: the manifest's version from pack-v3 on, the word table's key before. */
  pack: string | null;
  /** rc_info's `pack_content`: 16 hex characters over every file in the pack. Absent before pack-v3. */
  packContent: string | null;
  /** The pack this engine was opened from. */
  packId: string | null;
  ort: string | null;
  v7: ModelCheck;
  v5: ModelCheck;
  /** rc_open's code and error when it returned no engine. */
  openCode: number | null;
  openError: string | null;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const bool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

const NOT_RUN: ModelCheck = { ran: false, ok: null, maxDiff: null, topDiff: null, frames: null, notFinite: null, tol: null, prepacking: null };

function modelCheck(raw: unknown): ModelCheck {
  const m = record(raw);
  const prepacking = bool(m.prepacking);
  if (m.ran !== true) return { ...NOT_RUN, prepacking }; // a model can be open with no check file
  return {
    ran: true,
    ok: bool(m.ok),
    maxDiff: num(m.max_diff),
    topDiff: num(m.top_diff),
    frames: num(m.frames),
    notFinite: num(m.not_finite),
    tol: num(m.tol),
    prepacking,
  };
}

/** From an open engine's rc_info (parsed). Anything missing or malformed reads as not known, never as a pass. */
export function selfCheckFromInfo(info: unknown, packId: string | null): SelfCheck {
  const i = record(info);
  const c = record(i.self_check);
  const models = record(c.models);
  return {
    ran: c.ran === true,
    ok: bool(c.ok),
    pack: str(i.pack),
    packContent: str(i.pack_content),
    packId,
    ort: str(c.ort),
    v7: modelCheck(models.v7),
    v5: modelCheck(models.v5),
    openCode: null,
    openError: null,
  };
}

/** From an rc_open that returned no engine (a model that won't load, or an engine from before checks stayed open). */
export function selfCheckFromFailedOpen(code: number, error: string | null, packId: string | null): SelfCheck {
  return {
    ran: false,
    ok: false,
    pack: null,
    packContent: null,
    packId,
    ort: null,
    v7: NOT_RUN,
    v5: NOT_RUN,
    openCode: code,
    openError: error ? error.slice(0, 500) : null,
  };
}

/** From what an engine open resolved to (enginePackOpen, engineOpenRooms). */
export function selfCheckFromOpen(
  opened: { ok: boolean; code: number; error?: string; info?: string },
  packId: string | null,
): SelfCheck {
  if (!opened.ok) return selfCheckFromFailedOpen(opened.code, opened.error ?? null, packId);
  let info: unknown = null;
  try {
    info = opened.info ? JSON.parse(opened.info) : null;
  } catch {
    // reads as not known
  }
  return selfCheckFromInfo(info, packId);
}

/** The entry that goes in an onDeviceBench record's `runs` (the rules fix the top-level fields, not a run's). */
export function selfCheckRun(check: SelfCheck) {
  return { mode: 'selfCheck' as const, ...check };
}
