// Every English string, one file per folder of the app (src/i18n/README.md). The keys are what
// t() takes: t('updates.ready.title'). Another language is a copy of this folder with the same keys.
import { common } from './common';
import { help } from './help';
import { memorization } from './memorization';
import { mushaf } from './mushaf';
import { offline } from './offline';
import { player } from './player';
import { revision } from './revision';
import { updates } from './updates';
import { v2 } from './v2';

export const en = {
  common,
  help,
  memorization,
  mushaf,
  offline,
  player,
  revision,
  updates,
  v2,
} as const;

export type Strings = typeof en;
