// Every Arabic string, one file per English file (src/i18n/README.md, "Arabic"). A key not here yet shows in
// English. Words, voice, plurals and typography: src/i18n/ar-glossary.md.
import { common } from './common';
import { settings } from './settings';
import type { ArStrings } from './types';

export const ar: ArStrings = {
  common,
  settings,
};
