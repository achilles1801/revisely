// Revo's History: conversations grouped by the day they were last active, newest first.

import type { RevoChat } from './types';

export interface HistorySection {
  title: string;
  chats: RevoChat[];
}

const localDay = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** "Today", "Yesterday", or "Sunday 1 November". */
export function historyDayTitle(day: string, today: string, yesterday: string): string {
  if (day === today) return 'Today';
  if (day === yesterday) return 'Yesterday';
  return new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

/** Sections by day; `query` keeps the conversations whose title or line has it. */
export function historySections(chats: readonly RevoChat[], now: Date, query = ''): HistorySection[] {
  const today = localDay(now.getTime());
  const yesterday = localDay(now.getTime() - 86_400_000);
  const q = query.trim().toLowerCase();
  const kept = chats
    .filter((c) => !q || c.title.toLowerCase().includes(q) || (c.meta ?? '').toLowerCase().includes(q))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const out: HistorySection[] = [];
  for (const chat of kept) {
    const title = historyDayTitle(localDay(chat.updatedAt), today, yesterday);
    const last = out[out.length - 1];
    if (last && last.title === title) last.chats.push(chat);
    else out.push({ title, chats: [chat] });
  }
  return out;
}

/** "9:52 PM · plan added". */
export function historyLine(chat: RevoChat): string {
  const time = new Date(chat.updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return chat.meta ? `${time} · ${chat.meta}` : time;
}
