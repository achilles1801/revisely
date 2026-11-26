// E2E builds only: Home, version 3 (HOME-4 to HOME-7), which is Revisely Dev's until it ships, and its background.
//
//   revisely://e2e/home-v3?on=1
//   revisely://e2e/home-background?choice=glows   (glow, glows or ayah: Settings → Appearance → Home background)

import { HOME_BACKGROUNDS, setHomeBackground, type HomeBackground } from '../homeBackground';

let on = false;
const listeners = new Set<() => void>();

export function handleHomeV3Link(url: string): boolean {
  const pick = /^[a-z-]+:\/\/e2e\/home-background\?choice=([a-z]+)/.exec(url);
  if (pick && (HOME_BACKGROUNDS as readonly string[]).includes(pick[1])) {
    void setHomeBackground(pick[1] as HomeBackground);
    // eslint-disable-next-line no-console
    console.log(`[e2e] home-background ${pick[1]}`);
    return true;
  }
  const m = /^[a-z-]+:\/\/e2e\/home-v3\?on=([01])/.exec(url);
  if (!m) return false;
  on = m[1] === '1';
  // eslint-disable-next-line no-console
  console.log(`[e2e] home-v3 ${on ? 'on' : 'off'}`);
  listeners.forEach((l) => l());
  return true;
}

export function e2eHomeV3On(): boolean {
  return on;
}

export function onHomeV3Change(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
