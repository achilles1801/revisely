// Every English string, one file per folder of the app (src/i18n/README.md). The keys are what
// t() takes: t('updates.ready.title'). Another language is a copy of this folder with the same keys.
import { common } from './common';
import { help } from './help';
import { offline } from './offline';
import { player } from './player';
import { updates } from './updates';

export const en = {
  common,
  help,
  offline,
  player,
  updates,
} as const;

export type Strings = typeof en;
