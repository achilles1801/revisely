// E2E builds only: Home, version 3 (HOME-4, HOME-5), which is Revisely Dev's until it ships.
//
//   revisely://e2e/home-v3?on=1

let on = false;
const listeners = new Set<() => void>();

export function handleHomeV3Link(url: string): boolean {
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
