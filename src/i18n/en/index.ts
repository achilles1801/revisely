// Every English string, one file per folder of the app (src/i18n/README.md). The keys are what
// t() takes: t('updates.ready.title'). Another language is a copy of this folder with the same keys.
import { auth } from './auth';
import { coach } from './coach';
import { common } from './common';
import { help } from './help';
import { home } from './home';
import { insights } from './insights';
import { memorization } from './memorization';
import { mushaf } from './mushaf';
import { offline } from './offline';
import { onboarding } from './onboarding';
import { player } from './player';
import { prayer } from './prayer';
import { qibla } from './qibla';
import { reader } from './reader';
import { recite } from './recite';
import { recordings } from './recordings';
import { revision } from './revision';
import { timer } from './timer';
import { updates } from './updates';
import { v2 } from './v2';

export const en = {
  auth,
  coach,
  common,
  help,
  home,
  insights,
  memorization,
  mushaf,
  offline,
  onboarding,
  player,
  prayer,
  qibla,
  reader,
  recite,
  recordings,
  revision,
  timer,
  updates,
  v2,
} as const;

export type Strings = typeof en;
