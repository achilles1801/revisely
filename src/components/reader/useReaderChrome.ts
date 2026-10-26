import { useCallback, useState } from 'react';

/**
 * Whether the reader's controls show. Reading is the default: nothing but the
 * page. A tap on the page shows or hides them, turning the page by swiping
 * hides them, and `locked` keeps them up (e.g. while something needs them).
 */
export function useReaderChrome({ locked = false }: { locked?: boolean } = {}) {
  const [shown, setShown] = useState(false);
  const show = useCallback(() => setShown(true), []);
  const hide = useCallback(() => setShown(false), []);
  const toggle = useCallback(() => setShown((v) => !v), []);
  return { visible: shown || locked, show, hide, toggle };
}
