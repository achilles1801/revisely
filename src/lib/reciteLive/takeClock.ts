// A take's clock (seconds of microphone audio heard), held outside React state (Revisely Dev's long takes, Nov 20 2026).
//
// As state in the live take's hook, each second of the take re-rendered the whole reader and every page's layers. Only
// the bar's time and the immersive page's time show it, so they subscribe to it and nothing else re-renders.

import { useSyncExternalStore } from 'react';

export interface TakeClock {
  get(): number;
  set(seconds: number): void;
  subscribe(listener: () => void): () => void;
}

export function createTakeClock(): TakeClock {
  let seconds = 0;
  const listeners = new Set<() => void>();
  return {
    get: () => seconds,
    set(next) {
      if (next === seconds) return;
      seconds = next;
      for (const l of [...listeners]) l();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const NO_SUBSCRIBE = () => () => undefined;
const ZERO = () => 0;

/** The clock's seconds, re-rendering only the component that shows them; 0 without a clock. */
export function useTakeSeconds(clock: TakeClock | null | undefined): number {
  return useSyncExternalStore(clock ? clock.subscribe : NO_SUBSCRIBE, clock ? clock.get : ZERO, clock ? clock.get : ZERO);
}
