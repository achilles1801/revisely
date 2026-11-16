// Every English string, one file per folder of the app (src/i18n/README.md). The keys are what
// t() takes: t('updates.ready.title'). Another language is a copy of this folder with the same keys.
import { auth } from './auth';
import { coach } from './coach';
import { common } from './common';
import { help } from './help';
import { home } from './home';
import { insights } from './insights';
import { insightsTab } from './insightsTab';
import { journal } from './journal';
import { memorization } from './memorization';
import { mushaf } from './mushaf';
import { offline } from './offline';
import { onboarding } from './onboarding';
import { plan } from './plan';
import { player } from './player';
import { prayer } from './prayer';
import { preview } from './preview';
import { qibla } from './qibla';
import { reader } from './reader';
import { recite } from './recite';
import { recordings } from './recordings';
import { reminders } from './reminders';
import { revision } from './revision';
import { revo } from './revo';
import { settings } from './settings';
import { timer } from './timer';
import { updates } from './updates';
import { v2 } from './v2';
import { verse } from './verse';
import { whatsNew } from './whatsNew';

export const en = {
  auth,
  coach,
  common,
  help,
  home,
  insights,
  insightsTab,
  journal,
  memorization,
  mushaf,
  offline,
  onboarding,
  plan,
  player,
  prayer,
  preview,
  qibla,
  reader,
  recite,
  recordings,
  reminders,
  revision,
  revo,
  settings,
  timer,
  updates,
  v2,
  verse,
  whatsNew,
} as const;

export type Strings = typeof en;
