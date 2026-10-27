import { useCallback, useEffect, useRef, useState } from 'react';

/** The spinner gives up after this long; what's loading still lands when it's done. */
export const REFRESH_SPINNER_MAX_MS = 10_000;

/**
 * Pull to refresh: `refreshing` while `load` runs. The spinner always ends:
 * when `load` finishes, when it fails, or after REFRESH_SPINNER_MAX_MS if it
 * hangs (offline), so it never sits under the header for good.
 */
export function usePullToRefresh(load: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        load(),
        new Promise((resolve) => {
          timer = setTimeout(resolve, REFRESH_SPINNER_MAX_MS);
        }),
      ]);
    } catch {
      // The screen shows its own load error; the spinner just stops.
    } finally {
      if (timer) clearTimeout(timer);
      if (live.current) setRefreshing(false);
    }
  }, [load]);

  return { refreshing, onRefresh };
}
