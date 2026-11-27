// Friday's Al-Kahf card on Home's first frame (HOME-8; Majd, Nov 26 2026: "the Surah kahf card ... lags a little bit
// before it actually loads"). Whether Al-Kahf is read this Friday comes from the latest reading sessions, which Home
// reads from the server once Auth has the account (KAHF-2): seconds on a cold start, with the card held back meanwhile
// so a prompt never flashes into "Done". The answer is kept on the phone per account and Friday (read as the app
// starts, as homePrefs does), so the card shows with Home at once, and the server's answer replaces it quietly.
import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const KAHF_KNOWN_KEY = '@revisely_kahf_known:v1';

interface Known {
  uid: string;
  /** The Islamic Friday's day ('YYYY-MM-DD', lib/kahf). */
  friday: string;
  done: boolean;
}

let known: Known | null = null;
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

AsyncStorage.getItem(KAHF_KNOWN_KEY)
  .then((raw) => {
    if (known || !raw) return;
    const v = JSON.parse(raw) as Partial<Known> | null;
    if (v && typeof v.uid === 'string' && typeof v.friday === 'string' && typeof v.done === 'boolean') {
      known = { uid: v.uid, friday: v.friday, done: v.done };
    }
  })
  .catch(() => undefined)
  .finally(() => {
    loaded = true;
    emit();
  });

/** Remembers the server's answer for this account and Friday. */
export function rememberKahf(uid: string, friday: string, done: boolean): void {
  if (known && known.uid === uid && known.friday === friday && known.done === done) return;
  known = { uid, friday, done };
  emit();
  AsyncStorage.setItem(KAHF_KNOWN_KEY, JSON.stringify(known)).catch(() => undefined);
}

/** Whether Al-Kahf was read this Friday, as last known on this phone; null when not known for this account and Friday. */
export function useKahfKnown(uid: string | null | undefined, friday: string | null): boolean | null {
  const k = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    () => (loaded ? known : null),
  );
  return k && uid && friday && k.uid === uid && k.friday === friday ? k.done : null;
}

/** Tests only. */
export function resetKahfKnownForTests(next: Known | null = null): void {
  known = next;
  loaded = true;
  listeners.clear();
}
