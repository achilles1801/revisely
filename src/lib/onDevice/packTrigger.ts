// The one line the reader calls when it opens: Recite's pack starts downloading then (ONDEV-3). Only Revisely Dev loads
// the run, so the store app and the reader's tests never touch the file system or the callable for it.

import { isDevVariant } from '../variant';

export function readerOpened(): void {
  if (!isDevVariant()) return;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  (require('./packRun') as typeof import('./packRun')).requestPackDownload();
}
