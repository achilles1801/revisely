// Insights' Gaps and Last revised in Revo's context (BEHAVIOUR.md ACT-28, ACT-30), from Revisely Dev only: the
// figures the section and the screen show, in plain words for the model (days here; the Dev guide tells Revo to say
// long lengths as the app does, in weeks or months, and exact days when asked).

import { RevoGaps } from './types';

const days = (n: number) => (n === 1 ? '1 day' : `${n} days`);
const ago = (n: number) => (n === 0 ? 'today' : n === 1 ? 'yesterday' : `${days(n)} ago`);

/** How often they revise: 1 → "every day", 2 → "every 2 days", 1.5 → "every 1–2 days". */
function every(step: number): string {
  const low = Math.floor(step);
  if (step !== low) return `every ${low}–${low + 1} days`;
  return low === 1 ? 'every day' : `every ${low} days`;
}

/** The context's lines about gaps: the figures, then each memorized surah's last revision, longest first. */
export function gapsText(g: RevoGaps): string {
  const lines: string[] = [];
  // A gap is 2 days or more in a row without revising (the section's own count: Monday, then Thursday, is 2 days).
  const count = g.longGaps > 0 ? `${g.longGaps} ${g.longGaps === 1 ? 'gap' : 'gaps'}` : 'no gaps';
  const longest = g.longestGap
    ? `, the longest ${days(g.longestGap.days)} without revising${g.longestGap.endedDaysAgo === null ? ' (still going)' : ` (ended ${ago(g.longestGap.endedDaysAgo)})`}`
    : '';
  const usual = g.usualStepDays === null ? '' : `; usually ${every(g.usualStepDays)}`;
  lines.push(
    `Gaps (2 days or more in a row without revising), the last 30 days (Activity → Insights → “Gaps”): last revised ${ago(g.lastRevisedDaysAgo)}; ${count}${longest}${usual}.`,
  );
  const f = g.fullRevision;
  if (f) {
    lines.push(
      f.latePages > 0
        ? `Full revision: pushed back ${days(f.pushedBackDays)}; ${f.latePages} ${f.latePages === 1 ? 'page comes' : 'pages come'} round later than the plan would have had them (their plan goes round every ${days(f.cycleDays)}).`
        : `Full revision: on schedule; every page comes round within ${days(f.cycleDays)}, as their plan has it.`,
    );
  }
  if (g.surahs.length > 0) {
    const each = g.surahs.map((s) => `${s.name} ${s.daysAgo !== null ? ago(s.daysAgo) : s.notYet ? 'not revised yet (memorized under 30 days ago)' : 'never revised'}`);
    lines.push(`Last revised, each memorized surah, the longest since first (Activity → Insights → “Gaps” → “When did I last revise…?”): ${each.join('; ')}.`);
  }
  return lines.join('\n');
}
