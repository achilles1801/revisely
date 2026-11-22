// Every Arabic string, one file per English file (src/i18n/README.md, "Arabic"). A key not here yet shows in
// English. Words, voice, plurals and typography: src/i18n/ar-glossary.md.
import { common } from './common';
import { home } from './home';
import { insights } from './insights';
import { plan } from './plan';
import { read } from './read';
import { reader } from './reader';
import { recite } from './recite';
import { reciteLive } from './reciteLive';
import { revision } from './revision';
import { settings } from './settings';
import { verse } from './verse';
import type { ArStrings } from './types';

export const ar: ArStrings = {
  common,
  home,
  insights,
  plan,
  read,
  reader,
  recite,
  reciteLive,
  revision,
  settings,
  verse,
};
