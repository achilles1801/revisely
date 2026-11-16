// Every English string, one file per folder of the app (src/i18n/README.md). The keys are what
// t() takes: t('updates.ready.title'). Another language is a copy of this folder with the same keys.
import { updates } from './updates';

export const en = {
  updates,
} as const;

export type Strings = typeof en;
