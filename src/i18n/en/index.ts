// Every English string, one file per folder of the app (src/i18n/README.md). The keys are what
// t() takes: t('updates.ready.title'). Another language is a copy of this folder with the same keys.
import { account } from './account';
import { activity } from './activity';
import { auth } from './auth';
import { beginner } from './beginner';
import { coach } from './coach';
import { common } from './common';
import { help } from './help';
import { home } from './home';
import { insights } from './insights';
import { insightsTab } from './insightsTab';
import { journal } from './journal';
import { languages } from './languages';
import { lib } from './lib';
import { memorization } from './memorization';
import { mushaf } from './mushaf';
import { offline } from './offline';
import { onboarding } from './onboarding';
import { plan } from './plan';
import { player } from './player';
import { prayer } from './prayer';
import { premium } from './premium';
import { preview } from './preview';
import { qibla } from './qibla';
import { ramadan } from './ramadan';
import { read } from './read';
import { reader } from './reader';
import { recite } from './recite';
import { reciteCheck } from './reciteCheck';
import { reciteInsights } from './reciteInsights';
import { reciteLive } from './reciteLive';
import { reciteMemory } from './reciteMemory';
import { reciters } from './reciters';
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
  account,
  activity,
  auth,
  beginner,
  coach,
  common,
  help,
  home,
  insights,
  insightsTab,
  journal,
  languages,
  lib,
  memorization,
  mushaf,
  offline,
  onboarding,
  plan,
  player,
  prayer,
  premium,
  preview,
  qibla,
  ramadan,
  read,
  reader,
  recite,
  reciteCheck,
  reciteInsights,
  reciteLive,
  reciteMemory,
  reciters,
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
