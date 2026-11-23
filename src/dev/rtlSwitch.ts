// Development builds only (index.ts loads it under __DEV__): lays the app out right to left, to
// check screens before an RTL language ships (the Arabic study's step 5 sweep). Android's own
// "Force RTL layout direction" doesn't reach a React Native app that has turned RTL off (LANG-1).
//
//   iOS Simulator:     xcrun simctl openurl booted "revisely://devrtl?on=1"
//   Android emulator:  adb shell am start -a android.intent.action.VIEW -d "revisely://devrtl?on=1"
//   (on=0 back to left to right; a dev client without the revisely scheme: exp+revision-buddy://…)
//
// The app reloads right to left. React Native reads the direction as it starts, and the app sets
// its language's direction again at launch (src/i18n/direction.ts), so the launch after that one
// is left to right again: take the screenshots without reloading.

import { DevSettings, I18nManager, Linking } from 'react-native';

let installed = false;

function apply(url: string | null): void {
  const m = /^[a-z+.-]+:\/\/devrtl\?on=([01])/i.exec(url ?? '');
  if (!m) return;
  const on = m[1] === '1';
  if (on === I18nManager.isRTL) return;
  I18nManager.allowRTL(on);
  I18nManager.forceRTL(on);
  // eslint-disable-next-line no-console
  console.log(`[dev] layout ${on ? 'right to left' : 'left to right'}: reloading`);
  DevSettings.reload();
}

export function installRtlSwitch(): void {
  if (installed || !__DEV__) return;
  installed = true;
  Linking.addEventListener('url', ({ url }) => apply(url));
  void Linking.getInitialURL().then(apply, () => undefined);
}
