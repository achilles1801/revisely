import { useCallback, useEffect, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useReadingTimer } from '../../context/ReadingTimerContext';

/**
 * Run `load` whenever the screen gains focus (back from an editor) and when
 * the floating timer stops: its controls open over the screen, so a session
 * saved from them never refocuses it.
 */
export function useActivityReload(load: () => void) {
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const { timer } = useReadingTimer();
  const active = timer != null;
  const wasActive = useRef(active);
  useEffect(() => {
    if (wasActive.current && !active) load();
    wasActive.current = active;
  }, [active, load]);
}
