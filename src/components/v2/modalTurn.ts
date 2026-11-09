// One sheet at a time. iOS presents one modal at a time: a sheet asked to open while another is up
// (or still going) is refused, and React Native then keeps the refused sheet's host over the screen,
// invisible, taking every touch until the app restarts. On Nov 9 2026 Home froze that way after
// Jump to: "A new update is ready" opened by itself while the Today menu was up. Revo's "Open Jump
// to" did the same, opening Home's sheet while Revo's was still closing.
//
// So a sheet takes a turn before it shows (useModalTurn): it waits while another one holds it, and
// holds it from the moment it shows until it has gone (`release`, once the modal is dismissed). A
// sheet opened from inside another modal's content (ModalNest) shows over it at once: it is
// presented by that modal, which iOS allows. Modals that don't wait (useModalHold) still hold a turn
// while visible, so sheets wait for them; one that can hold sheets wraps its content in ModalNest.

import { createContext, createElement, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';

const holders = new Set<object>();

/** True inside a modal's content: a sheet opened there is presented by that modal, over it. */
const ModalNestContext = createContext(false);

/** Wraps a modal's content, so sheets opened inside it show over it at once. */
export function ModalNest({ children }: { children?: ReactNode }) {
  return createElement(ModalNestContext.Provider, { value: true }, children);
}

/** Whether this is inside a modal's content (ModalNest). */
export function useInsideModal(): boolean {
  return useContext(ModalNestContext);
}

const listeners = new Set<() => void>();
const notify = () => [...listeners].forEach((l) => l());

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Whether any sheet holds a turn now. */
export function modalShowing(): boolean {
  return holders.size > 0;
}

/** Whether any sheet holds a turn, as state: for what opens by itself and should wait. */
export function useModalShowing(): boolean {
  return useSyncExternalStore(subscribe, modalShowing, modalShowing);
}

function take(token: object, nested: boolean): boolean {
  if (holders.has(token)) return true;
  if (!nested && holders.size > 0) return false;
  holders.add(token);
  notify();
  return true;
}

function give(token: object): void {
  if (holders.delete(token)) notify();
}

/**
 * Whether a sheet that wants to show (`wanted`) may show now. It takes its turn as soon as no other
 * sheet holds one (at once when `nested`), and holds it until `release()`, which the sheet calls
 * once it has gone (iOS: the modal's onDismiss). Released on unmount too.
 */
export function useModalTurn(wanted: boolean, nested = false): { turn: boolean; release: () => void } {
  const token = useRef<object>({}).current;
  const [turn, setTurn] = useState(false);

  useEffect(() => {
    if (!wanted) {
      setTurn(false);
      return;
    }
    if (take(token, nested)) {
      setTurn(true);
      return;
    }
    // Another sheet is up or still going: this one shows once it has gone.
    const off = subscribe(() => {
      if (take(token, nested)) {
        off();
        setTurn(true);
      }
    });
    return off;
  }, [wanted, nested, token]);

  const release = useCallback(() => give(token), [token]);
  useEffect(() => () => give(token), [token]);

  return { turn: wanted && turn, release };
}

/** For a modal that shows at once (not a v2 Sheet): holds a turn while `visible`, so sheets wait for it. */
export function useModalHold(visible: boolean): void {
  const token = useRef<object>({}).current;
  useEffect(() => {
    if (!visible) return;
    holders.add(token);
    notify();
    return () => give(token);
  }, [visible, token]);
}

/** For tests. */
export function resetModalTurnsForTests(): void {
  holders.clear();
  notify();
}
