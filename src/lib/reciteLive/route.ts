// Each take to where it runs (lib/reciteLive/where): the phone's engine, or the checker's server.

import type { LiveConnect } from './feed';
import { EngineBridge, localFeed } from './localFeed';
import { chooseWhere, EngineInfo, RunsOn, WhereAnswer, WhereSetting } from './where';

/** The server's take line says why the take came to it (`ranWhy`; a checker that doesn't read it ignores it). */
const toServer = (server: LiveConnect, answer: WhereAnswer): LiveConnect => (start, handlers) =>
  Object.assign(server({ ...start, ranWhy: answer.why }, handlers), { ranWhere: () => answer });

export interface RouteDeps {
  server: LiveConnect;
  engine: () => EngineBridge | null;
  info: () => EngineInfo | null;
  fastEnough: () => boolean | null;
  settings: () => { config: WhereSetting | null; pin: RunsOn | null; testing: RunsOn | null };
  /** Open the engine in the background, for the takes after this one. */
  warm: () => void;
  onHostFrame?: (frame: Record<string, unknown>) => void;
  /** Where a take went and why; again, as `refused`, when the engine turns it down at its start. */
  onRouted?: (answer: WhereAnswer) => void;
}

export function routedFeed(deps: RouteDeps): LiveConnect {
  return (start, handlers) => {
    const s = deps.settings();
    if ((s.testing ?? s.pin ?? s.config ?? 'server') !== 'server') deps.warm();
    const answer = chooseWhere({ ...s, engine: deps.info(), fastEnough: deps.fastEnough(), start });
    const engine = answer.on === 'phone' ? deps.engine() : null;
    if (!engine) {
      const served: WhereAnswer = answer.on === 'phone' ? { on: 'server', why: 'no-pack' } : answer;
      deps.onRouted?.(served);
      return toServer(deps.server, served)(start, handlers);
    }
    deps.onRouted?.(answer);
    const refused = (detail: string): WhereAnswer => ({ on: 'server', why: 'refused', detail });
    let why = '';
    return localFeed({
      engine,
      asked: answer,
      fallback: (s, h) => toServer(deps.server, refused(why))(s, h),
      onHostFrame: deps.onHostFrame,
      onFallback: (detail) => {
        why = detail;
        deps.onRouted?.(refused(detail));
      },
    })(start, handlers);
  };
}
