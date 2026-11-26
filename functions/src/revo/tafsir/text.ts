/**
 * Arabic text as the model reads it: without harakat. Harakat add about 20% to the tokens (measured on page 379: 32,600
 * tokens with them, 26,900 without) and change nothing the model needs. The app shows the book's own text, harakat and
 * all, so every plain character keeps the place of the original one it came from.
 */

/** Harakat, the dagger alif, tatweel and the Qur'anic annotation marks. */
const MARK = /[ؐ-ًؚ-ٰٟـۖ-ۜ۟-۪ۨ-ۭ]/;

export interface PlainText {
  text: string;
  /** For each character of `text`, the index of the character in the original it came from. */
  at: number[];
}

export function plainArabic(original: string): PlainText {
  let text = '';
  const at: number[] = [];
  for (let i = 0; i < original.length; i++) {
    const c = original[i];
    if (MARK.test(c)) continue;
    text += c;
    at.push(i);
  }
  return { text, at };
}

/** The original's [start, end) for the plain text's [start, end): marks after the last character stay with it. */
export function originalRange(p: PlainText, start: number, end: number, originalLength: number): [number, number] {
  if (p.at.length === 0) return [0, 0];
  const s = p.at[Math.min(Math.max(start, 0), p.at.length - 1)];
  const lastPlain = Math.min(Math.max(end, 1), p.at.length) - 1;
  let e = p.at[lastPlain] + 1;
  const nextStart = lastPlain + 1 < p.at.length ? p.at[lastPlain + 1] : originalLength;
  e = Math.max(e, nextStart);
  return [s, e];
}
