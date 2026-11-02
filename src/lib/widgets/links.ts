// The links the widgets open (targets/widget):
//   revisely://today          today's revision session
//   revisely://home           Home (today is done, or there's no plan yet)
//   revisely://read?page=574  the reader at a page (the verse of the day's)
//   revisely://qibla          the Prayer sheet on Qibla (or the Qibla sheet), over Home
//   revisely://prayer         the Prayer sheet on Times, over Home

export type WidgetLink =
  | { kind: 'today' }
  | { kind: 'home' }
  | { kind: 'qibla' }
  | { kind: 'prayer' }
  | { kind: 'read'; page: number };

export function parseWidgetLink(url: string | null | undefined): WidgetLink | null {
  if (!url) return null;
  const m = /^revisely:\/\/([a-z]+)\/?(?:\?(.*))?$/i.exec(url.trim());
  if (!m) return null;
  const host = m[1].toLowerCase();
  if (host === 'today') return { kind: 'today' };
  if (host === 'home') return { kind: 'home' };
  if (host === 'qibla') return { kind: 'qibla' };
  if (host === 'prayer') return { kind: 'prayer' };
  if (host === 'read') {
    // By hand: React Native's URLSearchParams doesn't implement get().
    const page = Number(/(?:^|&)page=(\d{1,3})(?:&|$)/.exec(m[2] ?? '')?.[1]);
    return Number.isInteger(page) && page >= 1 && page <= 604 ? { kind: 'read', page } : null;
  }
  return null;
}

/** The Prayer sheet's tabs (components/prayer/PrayerSheet's PrayerTab). */
export type PrayerSheetTab = 'times' | 'qibla';

// The Qibla and prayer-time widgets open the Prayer sheet on their tab, wherever
// it is shown: the screen that hosts it listens with onPrayerSheetRequest. A
// request made before anything listens (a cold start from the widget) waits for
// the first listener, once; a later request replaces it.
let pendingTab: PrayerSheetTab | null = null;
const listeners = new Set<(tab: PrayerSheetTab) => void>();

export function requestPrayerSheet(tab: PrayerSheetTab): void {
  if (listeners.size === 0) {
    pendingTab = tab;
    return;
  }
  listeners.forEach((l) => l(tab));
}

/** Calls `open` whenever a widget asks for the sheet (and at once if one already has). */
export function onPrayerSheetRequest(open: (tab: PrayerSheetTab) => void): () => void {
  listeners.add(open);
  if (pendingTab) {
    const tab = pendingTab;
    pendingTab = null;
    open(tab);
  }
  return () => {
    listeners.delete(open);
  };
}

/** The Qibla widget's request: the sheet on Qibla. */
export function requestQiblaSheet(): void {
  requestPrayerSheet('qibla');
}

/** For a screen that hosts only the Qibla sheet: opens it for any request. */
export function onQiblaSheetRequest(open: () => void): () => void {
  return onPrayerSheetRequest(() => open());
}
