// The links the widgets open (targets/widget, Links.swift):
//   revisely://today          today's revision session
//   revisely://home           Home (today is done, or there's no plan yet)
//   revisely://read?page=574  the reader at a page (the verse of the day's)

export type WidgetLink = { kind: 'today' } | { kind: 'home' } | { kind: 'read'; page: number };

export function parseWidgetLink(url: string | null | undefined): WidgetLink | null {
  if (!url) return null;
  const m = /^revisely:\/\/([a-z]+)\/?(?:\?(.*))?$/i.exec(url.trim());
  if (!m) return null;
  const host = m[1].toLowerCase();
  if (host === 'today') return { kind: 'today' };
  if (host === 'home') return { kind: 'home' };
  if (host === 'read') {
    // By hand: React Native's URLSearchParams doesn't implement get().
    const page = Number(/(?:^|&)page=(\d{1,3})(?:&|$)/.exec(m[2] ?? '')?.[1]);
    return Number.isInteger(page) && page >= 1 && page <= 604 ? { kind: 'read', page } : null;
  }
  return null;
}
