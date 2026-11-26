/**
 * An answer from the tafsir, passed to the phone while the model writes it (REVO-44, Revisely Dev). A long answer that
 * quotes none of the books is never shown (reply.ts), so the stream keeps to that too: up to UNCITED_MAX_WORDS words go
 * at once, and anything past them waits for the answer's first quote. The answer the phone keeps is the finished one.
 */
import type { StreamEvents } from '../../coach/stream';
import { UNCITED_MAX_WORDS } from './reply';

const wordCount = (s: string) => (s.trim().match(/\S+/g) ?? []).length;

export function tafsirStream(send: (text: string) => void): StreamEvents {
  let shown = '';
  let held = '';
  let quoted = false;
  const flush = () => {
    if (!held) return;
    send(held);
    shown += held;
    held = '';
  };
  return {
    onText(text) {
      held += text;
      if (quoted || wordCount(shown + held) <= UNCITED_MAX_WORDS) flush();
    },
    onCitation() {
      quoted = true;
      flush();
    },
  };
}
