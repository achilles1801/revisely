// react-native's Modal for scenarios, presented as iOS presents it: its children while presented,
// onShow when it appears, and onDismiss once it has gone. React Native's own jest mock never calls
// onDismiss, and v2/Sheet runs a menu's action from it.
//
// One at a time, as on iOS: a modal asked to present while another is up is refused, unless it is
// presented from inside that one (rendered in its children).
// React Native then keeps the refused modal's host over the screen, invisible, taking every touch,
// and never reports it dismissed (the dismissal of a modal that never showed doesn't complete).
// That froze Home on Nov 9 2026 (SHEET-1). A refused modal here shows nothing and is listed by
// refusedModals() for as long as it stays mounted; the harness's taps fail while one is
// (harness/screens.tsx, assertTouchable).
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

interface Props {
  visible?: boolean;
  onShow?: () => void;
  onDismiss?: () => void;
  children?: React.ReactNode;
  testID?: string;
}

/** Inside a presented modal's children: a modal there is presented by it, over it. */
const Inside = createContext(false);
/** Top-level modals presented. */
const presented = new Set<object>();
/** Modals iOS refused, by what they are called, while they stay mounted. */
const refused = new Map<object, string>();

/** The modals iOS would have refused that are still mounted: each covers the screen, taking every touch. */
export function refusedModals(): string[] {
  return [...refused.values()];
}

/** Between tests (harness/afterEnv): nothing presented or refused. */
export function resetModalsForTests(): void {
  presented.clear();
  refused.clear();
}

type State = 'hidden' | 'shown' | 'refused';

function Modal({ visible = true, onShow, onDismiss, children, testID }: Props) {
  const nested = useContext(Inside);
  const token = useRef({}).current;
  const [state, setState] = useState<State>('hidden');
  const stateRef = useRef<State>('hidden');
  const show = useRef(onShow);
  show.current = onShow;
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  const set = (s: State) => {
    stateRef.current = s;
    setState(s);
  };

  useEffect(() => {
    const now = stateRef.current;
    if (visible) {
      if (now === 'shown') return;
      const other = [...presented].some((t) => t !== token);
      if (!nested && other) {
        refused.set(token, testID ?? 'a modal');
        set('refused');
        return;
      }
      refused.delete(token);
      if (!nested) presented.add(token);
      set('shown');
      show.current?.();
      return;
    }
    // Hidden: onDismiss a moment later. A refused one stays (no dismissal completes).
    if (now === 'shown') {
      set('hidden');
      presented.delete(token);
      setTimeout(() => dismiss.current?.(), 0);
    }
  }, [visible, nested, token, testID]);

  useEffect(
    () => () => {
      presented.delete(token);
      refused.delete(token);
    },
    [token],
  );

  if (state !== 'shown') return null;
  return (
    <Inside.Provider value>
      <View testID={testID}>{children}</View>
    </Inside.Provider>
  );
}

module.exports = { __esModule: true, default: Modal, refusedModals, resetModalsForTests };
