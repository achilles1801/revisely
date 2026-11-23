// The shape of the Arabic strings: English's keys, each optional while the translation is under way (a key not
// here falls back to English), with every plural in Arabic's six forms (`_zero`, `_one`, `_two`, `_few`, `_many`,
// `_other`) where English has two. A key English doesn't have fails the typecheck; src/i18n/__tests__/arabic.test.ts
// checks the rest (all six forms, the {{values}}, isolates, no ›).
import type { Strings } from '../en';

export type PluralForm = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';

type ArabicKey<K extends string> = K extends `${infer Base}_one`
  ? `${Base}_${PluralForm}`
  : K extends `${infer Base}_other`
    ? `${Base}_${PluralForm}`
    : K;

export type ArabicOf<T> = {
  [K in keyof T & string as ArabicKey<K>]?: T[K] extends string ? string : ArabicOf<T[K]>;
};

export type ArStrings = ArabicOf<Strings>;
