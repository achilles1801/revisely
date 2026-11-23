// E2E builds only: the journal's new look (ACT-33, ACT-34, HOME-2), which is Revisely Dev's until it ships.
//
//   revisely://e2e/journal-design?on=1

let on = false;
const listeners = new Set<() => void>();

export function handleJournalDesignLink(url: string): boolean {
  const m = /^[a-z-]+:\/\/e2e\/journal-design\?on=([01])/.exec(url);
  if (!m) return false;
  on = m[1] === '1';
  // eslint-disable-next-line no-console
  console.log(`[e2e] journal-design ${on ? 'on' : 'off'}`);
  listeners.forEach((l) => l());
  return true;
}

export function e2eJournalDesignOn(): boolean {
  return on;
}

export function onJournalDesignChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
