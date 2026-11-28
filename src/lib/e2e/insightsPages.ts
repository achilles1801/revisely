// E2E builds only: Insights' seven pages as Revisely Dev shows them, until they ship. The one Activity tab (ACT-35) opens
// each section's own page, and Memorization's page has its chart by month or by day (MEM-10). 09-insights-pages.yaml
// shoots them on the Activity seed, light and dark.
//
//   revisely://e2e/insights-pages?on=1

let on = false;
const listeners = new Set<() => void>();

export function handleInsightsPagesLink(url: string): boolean {
  const m = /^[a-z-]+:\/\/e2e\/insights-pages\?on=([01])/.exec(url);
  if (!m) return false;
  on = m[1] === '1';
  // eslint-disable-next-line no-console
  console.log(`[e2e] insights-pages ${on ? 'on' : 'off'}`);
  listeners.forEach((l) => l());
  return true;
}

export function e2eInsightsPagesOn(): boolean {
  return on;
}

export function onInsightsPagesChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
