import { useCallback, useEffect, useRef, useState } from 'react';
import { currentLanguage } from '../../i18n/instance';
import { dictation, dictationLang } from '../../lib/revo/dictation';

/**
 * Speaking a question to Revo (REVO-42): `start(text)` asks for the microphone and speech recognition the first time,
 * then the words heard so far go to `onText`, after what the field already holds. A pause ends it, as does `stop()`.
 * `available` is false where the build has no speech module: then there is no mic.
 */
export function useDictation(onText: (text: string) => void) {
  const mod = dictation();
  const [state, setState] = useState<'idle' | 'listening' | 'denied'>('idle');
  const onTextRef = useRef(onText);
  onTextRef.current = onText;
  const subs = useRef<{ remove(): void }[]>([]);
  const listening = useRef(false);
  const clear = useCallback(() => {
    subs.current.forEach((s) => s.remove());
    subs.current = [];
  }, []);

  useEffect(
    () => () => {
      clear();
      if (listening.current) mod?.abort();
    },
    [clear, mod],
  );

  const start = useCallback(
    async (current: string) => {
      if (!mod || listening.current) return;
      const { granted } = await mod.requestPermissionsAsync();
      if (!granted) {
        setState('denied');
        return;
      }
      const before = current.trim() ? `${current.trimEnd()} ` : '';
      clear();
      subs.current = [
        mod.addListener('result', (e) => onTextRef.current(before + (e.results[0]?.transcript ?? ''))),
        mod.addListener('end', () => {
          clear();
          listening.current = false;
          setState('idle');
        }),
        mod.addListener('error', () => undefined), // `end` follows every error
      ];
      listening.current = true;
      setState('listening');
      mod.start({ lang: dictationLang(currentLanguage()), interimResults: true, continuous: false, addsPunctuation: true });
    },
    [clear, mod],
  );

  const stop = useCallback(() => {
    if (listening.current) mod?.stop();
  }, [mod]);

  return { available: mod != null, listening: state === 'listening', denied: state === 'denied', start, stop };
}
