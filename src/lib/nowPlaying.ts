// Whether the recitation is on screen. A reader (or a revision session) that is
// focused and showing the recitation "presents" it, with its own player bar;
// anywhere else, while a recitation is going, the mini player stands in
// (components/player/MiniPlayer).

import { useEffect, useState } from 'react';
import { getRecitation, RecitationState } from './recitation';

const presenters = new Set<string>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** A screen starts or stops showing the recitation itself. */
export function setPresenting(owner: string, on: boolean): void {
  const had = presenters.has(owner);
  if (on === had) return;
  if (on) presenters.add(owner);
  else presenters.delete(owner);
  notify();
}

export function isPresented(): boolean {
  return presenters.size > 0;
}

/** Something to show: a verse loading, playing, paused or failed. */
export function isActive(state: RecitationState): boolean {
  return state.status !== 'idle' && state.verse != null;
}

/** The recitation, and whether the mini player should show it. */
export function useMiniPlayer(): { state: RecitationState; visible: boolean } {
  const recitation = getRecitation();
  const [state, setState] = useState<RecitationState>(() => recitation.getState());
  const [presented, setPresented] = useState(isPresented);
  useEffect(() => recitation.subscribe(setState), [recitation]);
  useEffect(() => {
    const update = () => setPresented(isPresented());
    listeners.add(update);
    update();
    return () => {
      listeners.delete(update);
    };
  }, []);
  return { state, visible: isActive(state) && !presented };
}

/** For tests. */
export function resetPresenters(): void {
  presenters.clear();
  notify();
}
