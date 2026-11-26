// Training recordings (Majd, Nov 26 2026: "once we get a lot of users and use their recordings to better train our model
// and we truly cross that final bar then we can charge"; he said yes to building it). "Help improve mistake detection"
// (RECITE-26) asks the checker to keep each take: its audio, the checker's result, and every "Not a mistake" or Put back
// with it, in `recite-tests/<uid>/` of the project's default bucket, which no client can reach (storage.rules).
//
// Revisely Dev has always kept them (on by default). The store app gets the switch with this one line
// (TRAINING_TAKES_RELEASED = true), on Majd's word, once production's checker keeps takes and the privacy text says so
// (handbook/dev-stack.md, "Training recordings in production"); the rule's lines then move from Revo's Dev guide to the
// main guide. Until then the store app never shows it and never asks for a take to be kept.

import { isDevVariant } from '../variant';

export const TRAINING_TAKES_RELEASED = false;

/**
 * Whether the switch starts on in the store app, for an account that has never set it on this phone: Majd's call (the
 * recommendation is off: people choose to help). A value the phone saved without the user choosing never counts.
 */
export const TRAINING_STORE_DEFAULT = false;

let forTests: boolean | undefined;

export const trainingTakesReleased = (): boolean => forTests ?? TRAINING_TAKES_RELEASED;

/** For tests: run as if the switch were on (or off); undefined: as the switch says. */
export function setTrainingTakesReleasedForTests(on: boolean | undefined): void {
  forTests = on;
}

/** Whether this app offers "Help improve mistake detection": Revisely Dev always, the store app once released. */
export function trainingTakesOffered(): boolean {
  return trainingTakesReleased() || isDevVariant();
}
