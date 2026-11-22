/**
 * Settings → Report a problem (SET-2): what the form holds while it is open, kept outside the screens so
 * the form can step aside for a screenshot of any screen and come back with the words still there.
 *
 * - `form`: the sheet is up.
 * - `capture`: the sheet is away and a small bar offers "Capture this screen" over whatever screen is in front.
 */
import { useSyncExternalStore } from 'react';

export type ReportShot = { filename: string; data: Uint8Array; contentType?: string };
export type ReportState = {
  phase: 'closed' | 'form' | 'capture';
  text: string;
  shot: ReportShot | null;
  /** The last try at a screenshot failed (said once in the form). */
  shotFailed: boolean;
};

const CLOSED: ReportState = { phase: 'closed', text: '', shot: null, shotFailed: false };
let state: ReportState = CLOSED;
const listeners = new Set<() => void>();

function set(next: Partial<ReportState>): void {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

/** Opens an empty form. */
export function openReportProblem(): void {
  state = { ...CLOSED, phase: 'form' };
  listeners.forEach((l) => l());
}
/** Cancel, a sent report, or signing out: the words and the screenshot go. */
export function closeReportProblem(): void {
  if (state === CLOSED) return;
  state = CLOSED;
  listeners.forEach((l) => l());
}
export const setReportText = (text: string) => set({ text });
/** The form steps aside so the screen with the problem can be shown and captured. */
export const startReportCapture = () => set({ phase: 'capture', shotFailed: false });
/** Back to the form, with the screenshot (or without: cancelled, or it failed). */
export const endReportCapture = (shot: ReportShot | null, failed = false) =>
  set({ phase: 'form', shot: shot ?? state.shot, shotFailed: failed });
export const removeReportShot = () => set({ shot: null, shotFailed: false });

export function getReportState(): ReportState {
  return state;
}
export function useReportState(): ReportState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getReportState,
    getReportState,
  );
}
