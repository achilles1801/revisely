// Which bottom corner Revo's button sits in (BEHAVIOUR.md REVO-41; Majd, Nov 23 2026: "let's make the revo icon bottom
// right be movable so a user can drag it to the other side so either just bottom right or bottom left and that position
// is saved in memory meaning the app remembers it"). Kept on this phone, per account. The side is where it is on the
// screen, not start or end, so it stays under the same thumb if the app's language changes direction.

import { useCallback, useEffect, useState } from 'react';
import { I18nManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../logger';

export type RevoButtonSide = 'left' | 'right';

const keyOf = (uid: string) => `@revo_button_side:${uid}`;

/** Before it has been moved: the end of the line, right in a left-to-right language and left in Arabic. */
export const defaultRevoButtonSide = (rtl: boolean = I18nManager.isRTL): RevoButtonSide => (rtl ? 'left' : 'right');

/**
 * Where a drag has the button, from 0 (its default corner) to 1 (the other one): `from` when it began, `dx` the finger's
 * travel in points, `travel` the distance between the corners. `dir` is 1 left to right, -1 right to left.
 */
export function dragPosition(from: number, dx: number, travel: number, dir: number): number {
  'worklet';
  if (travel <= 0) return from;
  return Math.max(0, Math.min(1, from - (dir * dx) / travel));
}

/** The corner a release lands in (0 or 1): the nearer one, counting where a flick was heading. */
export function dragTarget(position: number, velocityX: number, travel: number, dir: number): 0 | 1 {
  'worklet';
  const heading = travel > 0 ? position - (dir * velocityX * 0.12) / travel : position;
  return heading >= 0.5 ? 1 : 0;
}

/** The position (0 or 1) of a side. */
export function sidePosition(side: RevoButtonSide, rtl: boolean = I18nManager.isRTL): 0 | 1 {
  return side === defaultRevoButtonSide(rtl) ? 0 : 1;
}

/** The side at a position (0 or 1). */
export function positionSide(position: 0 | 1, rtl: boolean = I18nManager.isRTL): RevoButtonSide {
  const start = defaultRevoButtonSide(rtl);
  if (position === 0) return start;
  return start === 'right' ? 'left' : 'right';
}

export async function loadRevoButtonSide(uid: string): Promise<RevoButtonSide> {
  try {
    const raw = await AsyncStorage.getItem(keyOf(uid));
    return raw === 'left' || raw === 'right' ? raw : defaultRevoButtonSide();
  } catch (err) {
    logger.warn('Could not read where Revo’s button goes', err);
    return defaultRevoButtonSide();
  }
}

export async function saveRevoButtonSide(uid: string, side: RevoButtonSide): Promise<void> {
  try {
    await AsyncStorage.setItem(keyOf(uid), side);
  } catch (err) {
    logger.warn('Could not save where Revo’s button goes', err);
  }
}

/** This account's side; null until it has been read, so the button never shows in one corner and jumps to the other. */
export function useRevoButtonSide(uid: string): { side: RevoButtonSide | null; setSide: (side: RevoButtonSide) => void } {
  const [state, setState] = useState<{ uid: string; side: RevoButtonSide } | null>(null);
  useEffect(() => {
    if (!uid) return;
    let live = true;
    void loadRevoButtonSide(uid).then((side) => {
      if (live) setState((now) => (now?.uid === uid ? now : { uid, side }));
    });
    return () => {
      live = false;
    };
  }, [uid]);
  const setSide = useCallback(
    (side: RevoButtonSide) => {
      if (!uid) return;
      setState({ uid, side });
      void saveRevoButtonSide(uid, side);
    },
    [uid],
  );
  return { side: state?.uid === uid ? state.side : null, setSide };
}
