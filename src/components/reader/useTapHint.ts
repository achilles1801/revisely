import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@revisely_reader_tap_hint_seen';

/**
 * "Tap the page for the controls", under the page number until the first tap
 * (once, for both readers): those who knew the reader with its controls always
 * showing would otherwise not know where they went.
 */
export function useTapHint() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(KEY)
      .then((v) => {
        if (live && v !== 'true') setShown(true);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  const dismiss = useCallback(() => {
    setShown((was) => {
      if (was) AsyncStorage.setItem(KEY, 'true').catch(() => undefined);
      return false;
    });
  }, []);
  return { shown, dismiss };
}
