// Settings → About → Licences (SET-5, Nov 23 2026): the Quran Muaalem License in full. Revisely's recitation model is
// derived from Quran Muaalem's, and once the model runs on the phone (on-device Recite, Revisely Dev first) every copy
// of the app is a distribution, which must "reproduce this License in full" (section 2.4). While the model runs on our
// server nothing is distributed, so the store app doesn't need it yet.
//
// One switch, flipped with on-device Recite's release (release checklist rows 40 and 41): off, the row is Revisely
// Dev's; on, everyone's. releaseGates.test.ts holds both ways.

import { isDevVariant } from '../variant';

export const MODEL_LICENSE_RELEASED = false;

let forTests: boolean | undefined;

export const modelLicenseReleased = (): boolean => forTests ?? MODEL_LICENSE_RELEASED;

/** For tests: run as if the switch were on (or off); undefined: as the switch says. */
export function setModelLicenseReleasedForTests(on: boolean | undefined): void {
  forTests = on;
}

/** Whether About shows Licences: everyone once released, Revisely Dev until then. */
export const showsModelLicense = (): boolean => modelLicenseReleased() || isDevVariant();
