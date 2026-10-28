// The links the widgets open (targets/widget, Links.swift):
//   revisely://today          today's revision session
//   revisely://home           Home (today is done, or there's no plan yet)
//   revisely://read?page=574  the reader at a page (the verse of the day's)
//   revisely://qibla          the Qibla sheet, over Home

export type WidgetLink = { kind: 'today' } | { kind: 'home' } | { kind: 'qibla' } | { kind: 'read'; page: number };

export function parseWidgetLink(url: string | null | undefined): WidgetLink | null {
  if (!url) return null;
  const m = /^revisely:\/\/([a-z]+)\/?(?:\?(.*))?$/i.exec(url.trim());
  if (!m) return null;
  const host = m[1].toLowerCase();
  if (host === 'today') return { kind: 'today' };
  if (host === 'home') return { kind: 'home' };
  if (host === 'qibla') return { kind: 'qibla' };
  if (host === 'read') {
    // By hand: React Native's URLSearchParams doesn't implement get().
    const page = Number(/(?:^|&)page=(\d{1,3})(?:&|$)/.exec(m[2] ?? '')?.[1]);
    return Number.isInteger(page) && page >= 1 && page <= 604 ? { kind: 'read', page } : null;
  }
  return null;
}

// The Qibla widget opens the Qibla sheet, wherever it is shown: the screen that
// hosts it listens with onQiblaSheetRequest. A request made before anything
// listens (a cold start from the widget) waits for the first listener.
let qiblaPending = false;
const qiblaListeners = new Set<() => void>();

export function requestQiblaSheet(): void {
  if (qiblaListeners.size === 0) {
    qiblaPending = true;
    return;
  }
  qiblaListeners.forEach((l) => l());
}

/** Calls `open` whenever the widget asks for the sheet (and at once if it already has). */
export function onQiblaSheetRequest(open: () => void): () => void {
  qiblaListeners.add(open);
  if (qiblaPending) {
    qiblaPending = false;
    open();
  }
  return () => {
    qiblaListeners.delete(open);
  };
}
