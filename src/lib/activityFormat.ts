// Activity's number formats (gap audit §1 H): minutes read as "8 min" and "1 h 5 min", never "8m".

export function formatMinutesLong(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** "Wednesday 28 October": the weekday, the day, the month (the mocks' order, no comma). */
export function formatDayLong(day: string): string {
  const date = new Date(`${day}T00:00:00`);
  const weekday = date.toLocaleDateString('en-US', { weekday: 'long' });
  const month = date.toLocaleDateString('en-US', { month: 'long' });
  return `${weekday} ${date.getDate()} ${month}`;
}

/**
 * The day view's two-line title (gap audit §4): "Today" / "Tuesday 3 November", "Yesterday" /
 * "Monday 2 November", and before that "Wednesday" / "28 October".
 */
export function dayTitle(day: string, today: string): { title: string; subtitle: string } {
  const date = new Date(`${day}T00:00:00`);
  const t = new Date(`${today}T00:00:00`);
  const yesterday = new Date(t.getFullYear(), t.getMonth(), t.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() && date.getMonth() === yesterday.getMonth() && date.getDate() === yesterday.getDate();
  if (day === today) return { title: 'Today', subtitle: formatDayLong(day) };
  if (isYesterday) return { title: 'Yesterday', subtitle: formatDayLong(day) };
  const month = date.toLocaleDateString('en-US', { month: 'long' });
  const year = date.getFullYear() !== t.getFullYear() ? ` ${date.getFullYear()}` : '';
  return { title: date.toLocaleDateString('en-US', { weekday: 'long' }), subtitle: `${date.getDate()} ${month}${year}` };
}
