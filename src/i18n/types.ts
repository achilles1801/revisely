// t()'s keys and values are typed from the English strings: a key that doesn't exist, or a
// missing {{value}}, fails the typecheck.
import type { Strings } from './en';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: Strings };
    returnNull: false;
  }
}

export {};
