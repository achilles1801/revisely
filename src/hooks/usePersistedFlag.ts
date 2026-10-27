import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * A yes/no kept on this device (a section folded or open), read back on the
 * next visit. Until the saved value loads, `initial`.
 */
export function usePersistedFlag(key: string, initial: boolean): [boolean, (next: boolean) => void] {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(key)
      .then((saved) => {
        if (alive && saved != null) setValue(saved === 'true');
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [key]);
  const set = useCallback(
    (next: boolean) => {
      setValue(next);
      AsyncStorage.setItem(key, next ? 'true' : 'false').catch(() => {});
    },
    [key],
  );
  return [value, set];
}
