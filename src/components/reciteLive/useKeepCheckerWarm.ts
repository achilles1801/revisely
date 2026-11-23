import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { warmUpReciteCheck } from '../../lib/reciteCheck/service';

/**
 * How often the checker is woken while the reader waits (recite-server, Nov 15 2026; Majd's yes): Cloud Run stops an
 * idle instance after about 15 minutes, and a new one takes 6–9 s to be ready, which a mic tapped after a long read
 * would meet before `ready`. Its /health takes no sign-in, never touches the model and costs nothing at 6 an hour.
 */
export const WARM_EVERY_MS = 10 * 60_000;

/**
 * Keeps the checker warm while the reader is open, focused and in front with live checking on (`on`): a wake on
 * opening, then every WARM_EVERY_MS, and on coming back once that long has passed. None while a take is going (`busy`:
 * its connection holds the instance), off screen or in the background.
 */
export function useKeepCheckerWarm(on: boolean, busy: boolean, warm: () => void = warmUpReciteCheck): void {
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const warmRef = useRef(warm);
  warmRef.current = warm;
  // When it last woke it, across focus changes: a reader left for a moment doesn't wake it again.
  const lastRef = useRef(0);

  useEffect(() => {
    if (!on) return undefined;
    let timer: ReturnType<typeof setInterval> | null = null;
    const wake = (force: boolean) => {
      if (busyRef.current) return;
      if (!force && Date.now() - lastRef.current < WARM_EVERY_MS) return;
      lastRef.current = Date.now();
      warmRef.current();
    };
    const start = () => {
      if (timer) return;
      timer = setInterval(() => wake(true), WARM_EVERY_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    // 'unknown' before the first report counts as in front; 'inactive' (Control Center, a call coming) doesn't.
    const inFront = (s: string | null | undefined) => s !== 'background' && s !== 'inactive';
    if (inFront(AppState.currentState)) {
      wake(false);
      start();
    }
    const sub = AppState.addEventListener('change', (s) => {
      if (inFront(s)) {
        wake(false);
        start();
      } else stop();
    });
    return () => {
      stop();
      sub.remove();
    };
  }, [on]);
}

/**
 * Wakes the checker when the app opens or comes to the front, for an account that can recite (`on`), at most once every
 * WARM_EVERY_MS (Nov 22 2026, the orchestrator's yes): production's instances scale to zero and take about 10 s to
 * start, and the reader's own wake (above) came too late for a take begun as it opened. Only a GET of /health: no
 * sign-in, no model, no interval, nothing while the app is in the background.
 */
export function useWarmCheckerOnFront(on: boolean, warm: () => void = warmUpReciteCheck): void {
  const warmRef = useRef(warm);
  warmRef.current = warm;
  const lastRef = useRef(0);
  useEffect(() => {
    if (!on) return undefined;
    const inFront = (s: string | null | undefined) => s !== 'background' && s !== 'inactive';
    const wake = () => {
      if (Date.now() - lastRef.current < WARM_EVERY_MS) return;
      lastRef.current = Date.now();
      warmRef.current();
    };
    if (inFront(AppState.currentState)) wake();
    const sub = AppState.addEventListener('change', (s) => {
      if (inFront(s)) wake();
    });
    return () => sub.remove();
  }, [on]);
}
