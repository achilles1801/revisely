import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useRoute } from '@react-navigation/native';

// Where the floating timer sits, per screen. Kept apart from FloatingTimer so
// screens can use the hook without pulling in the timer UI.

/** Height of the button, for screens that leave room for it under content. */
export const FLOATING_TIMER_SIZE = 48;

/** Points from the bottom of the screen, or 'hidden' (e.g. the reader with
 *  its controls hidden, so nothing sits over the page). */
export type TimerPlacement = number | 'hidden';

type OffsetApi = {
  offsets: Record<string, TimerPlacement>;
  setOffset: (routeKey: string, bottom: TimerPlacement | null) => void;
};

const OffsetContext = createContext<OffsetApi | null>(null);

export function FloatingTimerProvider({ children }: { children: ReactNode }) {
  const [offsets, setOffsets] = useState<Record<string, TimerPlacement>>({});
  const setOffset = useCallback((routeKey: string, bottom: TimerPlacement | null) => {
    setOffsets((prev) => {
      if (bottom == null) {
        if (!(routeKey in prev)) return prev;
        const next = { ...prev };
        delete next[routeKey];
        return next;
      }
      return prev[routeKey] === bottom ? prev : { ...prev, [routeKey]: bottom };
    });
  }, []);
  const value = useMemo(() => ({ offsets, setOffset }), [offsets, setOffset]);
  return <OffsetContext.Provider value={value}>{children}</OffsetContext.Provider>;
}

/**
 * Lift the floating timer on this screen to `bottom` points from the bottom
 * of the screen (e.g. above a player or a submit bar). null uses the default.
 * Keyed by route, so it only applies while this screen is the focused one.
 */
export function useFloatingTimerOffset(bottom: TimerPlacement | null) {
  const ctx = useContext(OffsetContext);
  const routeKey = useRoute().key;
  const setOffset = ctx?.setOffset;
  useEffect(() => {
    setOffset?.(routeKey, bottom);
  }, [setOffset, routeKey, bottom]);
  useEffect(() => () => setOffset?.(routeKey, null), [setOffset, routeKey]);
}

/** The offsets screens have asked for, by route key. */
export function useFloatingTimerOffsets(): Record<string, TimerPlacement> | undefined {
  return useContext(OffsetContext)?.offsets;
}
