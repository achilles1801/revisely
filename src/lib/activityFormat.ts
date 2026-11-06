// Activity's number formats (gap audit §1 H): minutes read as "8 min" and "1 h 5 min", never "8m".

export function formatMinutesLong(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
