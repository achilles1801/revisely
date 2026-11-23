// Which model the app's checker runs for each level, for Revisely Dev's Settings → Testing (Majd, Nov 18 2026: "let's
// put the model number being used in the dev only settings so i know what im using"). Read from the checker's own
// /health (revisely-internal's checker/server.py: `ears`, `server`), which needs no sign-in and never touches the model.
import { checker } from './endpoints';

/** Each level's model as the checker names it ('v7', 'released', 'released+v5'), and the server's commit. */
export interface CheckerModels {
  recite: string;
  harakat: string;
  strict: string;
  /** The checker's commit, first 8 characters, when it says. */
  server?: string;
}

const isName = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 40;

/** The models from a /health answer, or null when it doesn't name all three (an older checker: never guessed). */
export function modelsOf(health: unknown): CheckerModels | null {
  const h = (health ?? {}) as { ears?: Record<string, unknown>; server?: unknown };
  const e = h.ears ?? {};
  if (!isName(e.recite) || !isName(e.harakat) || !isName(e.strict)) return null;
  return {
    recite: e.recite,
    harakat: e.harakat,
    strict: e.strict,
    ...(isName(h.server) ? { server: h.server.slice(0, 8) } : {}),
  };
}

/**
 * A model's short name: the last part of what the checker says. Strict's 'released+v5' is v5 run on top of the
 * released model, and v5 is the one that differs, so it reads "v5". 'v7' stays 'v7', 'released' stays 'released'.
 */
export function shortModel(name: string): string {
  const parts = name.split('+');
  return parts[parts.length - 1];
}

export interface ModelDeps {
  fetch: (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;
  base: string;
  timeoutMs: number;
}

const defaults = (): ModelDeps => ({ fetch: (url, init) => fetch(url, init), base: checker().base, timeoutMs: 20_000 });

/**
 * The checker's models, or null if it couldn't be reached or didn't say. A sleeping checker takes 6–9 s to wake, so
 * the wait is 20 s.
 */
export async function readCheckerModels(deps: Partial<ModelDeps> = {}): Promise<CheckerModels | null> {
  const d = { ...defaults(), ...deps };
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), d.timeoutMs);
  try {
    const res = await d.fetch(`${d.base}/health`, { signal: abort.signal });
    if (!res.ok) return null;
    return modelsOf(await res.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
