import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Whether the reader's controls show. Reading is the default: nothing but the
 * page. A tap on the page shows or hides them, turning the page by swiping
 * hides them, and `locked` keeps them up (e.g. while something needs them):
 * taps and swipes leave them alone meanwhile, and when it lets go they stay up,
 * rather than vanishing under the user's finger.
 */
export function useReaderChrome({ locked = false }: { locked?: boolean } = {}) {
  const [shown, setShown] = useState(locked);
  const lockedRef = useRef(locked);
  lockedRef.current = locked;
  useEffect(() => {
    if (locked) setShown(true);
  }, [locked]);
  const show = useCallback(() => setShown(true), []);
  const hide = useCallback(() => {
    if (!lockedRef.current) setShown(false);
  }, []);
  const toggle = useCallback(() => {
    if (!lockedRef.current) setShown((v) => !v);
  }, []);
  return { visible: shown || locked, show, hide, toggle };
}
