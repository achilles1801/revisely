// Each take to where it runs (lib/reciteLive/where): the phone's engine, or the checker's server.

import type { LiveConnect } from './feed';
import { EngineBridge, localFeed } from './localFeed';
import { chooseWhere, EngineInfo, RunsOn, WhereAnswer, WhereSetting } from './where';

export interface RouteDeps {
  server: LiveConnect;
  engine: () => EngineBridge | null;
  info: () => EngineInfo | null;
  fastEnough: () => boolean | null;
  settings: () => { config: WhereSetting | null; pin: RunsOn | null; testing: RunsOn | null };
  /** Open the engine in the background, for the takes after this one. */
  warm: () => void;
  onHostFrame?: (frame: Record<string, unknown>) => void;
  /** Where a take went and why; `refused` when the engine turned it down at its start. */
  onRouted?: (answer: WhereAnswer, refused?: string) => void;
}

export function routedFeed(deps: RouteDeps): LiveConnect {
  return (start, handlers) => {
    const s = deps.settings();
    if ((s.testing ?? s.pin ?? s.config ?? 'server') !== 'server') deps.warm();
    const answer = chooseWhere({ ...s, engine: deps.info(), fastEnough: deps.fastEnough(), start });
    const engine = answer.on === 'phone' ? deps.engine() : null;
    if (!engine) {
      deps.onRouted?.(answer.on === 'phone' ? { on: 'server', why: 'no-engine' } : answer);
      return deps.server(start, handlers);
    }
    deps.onRouted?.(answer);
    return localFeed({
      engine,
      fallback: deps.server,
      onHostFrame: deps.onHostFrame,
      onFallback: (why) => deps.onRouted?.({ on: 'server', why: 'refused' }, why),
    })(start, handlers);
  };
}
