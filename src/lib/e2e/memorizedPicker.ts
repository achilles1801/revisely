// E2E builds only: the Memorized picker (MEM-8), which is Revisely Dev's until it ships.
//
//   revisely://e2e/memorized-picker?on=1   the sheet chooses on the page, as in Revisely Dev
//
// E2E builds fetch no page images. Pages 379 to 381 are put on the phone (all three are page 379's image, the one
// fixture there is: enough to see the layout), and 382 stays missing, for the list a page not downloaded gets.

import { putPage379 } from './reciteLive';

let on = false;

export function handleMemorizedPickerLink(url: string): boolean {
  const m = /^[a-z-]+:\/\/e2e\/memorized-picker\?on=([01])/.exec(url);
  if (!m) return false;
  on = m[1] === '1';
  // eslint-disable-next-line no-console
  console.log(`[e2e] memorized-picker ${on ? 'on' : 'off'}`);
  if (on) void putPage379([379, 380, 381]);
  return true;
}

export function e2eMemorizedPickerOn(): boolean {
  return on;
}
