// Every Arabic string, one file per English file (src/i18n/README.md, "Arabic"). A key not here yet shows in
// English. Words, voice, plurals and typography: src/i18n/ar-glossary.md.
import { auth } from './auth';
import { common } from './common';
import { home } from './home';
import { insights } from './insights';
import { mushaf } from './mushaf';
import { onboarding } from './onboarding';
import { plan } from './plan';
import { prayer } from './prayer';
import { read } from './read';
import { reader } from './reader';
import { recite } from './recite';
import { reciteInsights } from './reciteInsights';
import { reciteLive } from './reciteLive';
import { reciteMemory } from './reciteMemory';
import { recordings } from './recordings';
import { reminders } from './reminders';
import { revision } from './revision';
import { settings } from './settings';
import { timer } from './timer';
import { verse } from './verse';
import type { ArStrings } from './types';

export const ar: ArStrings = {
  auth,
  common,
  home,
  insights,
  mushaf,
  onboarding,
  plan,
  prayer,
  read,
  reader,
  recite,
  reciteInsights,
  reciteLive,
  reciteMemory,
  recordings,
  reminders,
  revision,
  settings,
  timer,
  verse,
};
