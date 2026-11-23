// Recite's kill switch (recite-server-prod-plan.md): config/app's `reciteCheckOff`, exactly true, closes the reader's mic
// to Recite and Mark mistakes (availability reciteLiveEnabled); the mic records as before, and takes already kept stay
// shown. It's read with What's new's switch, in the same read of config/app (lib/whatsNew/killSwitch), and kept on the
// phone. Set it with functions/scripts/set-app-config.js --recite-check off (on to undo).

let off = false;

/** Whether Recite's checking is switched off; false until config/app (or the phone's copy) has said. */
export const reciteCheckOff = (): boolean => off;

/** From config/app's read (or the phone's copy); tests set it directly. */
export function setReciteCheckOff(on: boolean): void {
  off = on;
}
