// The E2E build's trace of screens (E2E builds only, .maestro/README.md): each stack screen's focus
// and its native transition, start and end, in the build's log (lib/e2e/log).
//
// Twice on a CI iOS Simulator (#328's runs, Nov 8–9 2026) a screen just pushed (a Day; the daily
// log) was drawn but missing from iOS's accessibility tree for 16 to 25 s, so Maestro couldn't find
// it. These lines say whether its push had ended by then, and whether a sheet's native modal (which
// hides what is under it from that tree) was still up.

type TransitionEvent = { data?: { closing?: boolean } };

function say(line: string): void {
  // eslint-disable-next-line no-console
  console.log(`[e2e] ${line}`);
}

/** A stack navigator's `screenListeners`: each screen's focus, blur and transitions. */
export function screenListeners({ route }: { route: { name: string } }) {
  const way = (e: TransitionEvent) => (e?.data?.closing ? 'closing' : 'opening');
  return {
    focus: () => say(`screen ${route.name} focus`),
    blur: () => say(`screen ${route.name} blur`),
    transitionStart: (e: TransitionEvent) => say(`screen ${route.name} ${way(e)} start`),
    transitionEnd: (e: TransitionEvent) => say(`screen ${route.name} ${way(e)} end`),
  };
}

/**
 * A sheet's native modal, presented or dismissed (v2/Sheet's onShow and onDismiss), or replaced
 * because iOS never said it had gone (v2/Sheet's DISMISS_FALLBACK_MS).
 */
export function sayModal(testID: string | undefined, what: 'shown' | 'dismissed' | 'replaced'): void {
  say(`sheet ${testID ?? '(no id)'} ${what}`);
}
