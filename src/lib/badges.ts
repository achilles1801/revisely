// Badges for pages revised (ACCOUNT-5; Majd, Nov 26 2026: "think like cod where theres bronze diamond etc"). Every
// revision counts: a page revised on three days is three (lib/accountJourney). Twelve milestones, two a tier (I, then
// II), each tier its own shape and material (components/account/BadgeMark, theme/v2 BADGE_MATERIALS), roughly ×2–2.5 a
// step, so a badge comes about as often early on as later.
import type { BadgeTier } from '../theme/v2';
import { formatNumber, t } from '../i18n';

export const MILESTONES = [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000] as const;
export type Milestone = (typeof MILESTONES)[number];

export const TIERS: readonly BadgeTier[] = ['bronze', 'silver', 'gold', 'platinum', 'diamond', 'emerald'];

export interface Badge {
  milestone: Milestone;
  tier: BadgeTier;
  /** 1 or 2: the tier's first badge or its second. */
  level: 1 | 2;
}

export function badgeOf(milestone: Milestone): Badge {
  const i = MILESTONES.indexOf(milestone);
  if (i < 0) throw new Error(`Not a milestone: ${milestone}`);
  return { milestone, tier: TIERS[Math.floor(i / 2)], level: i % 2 === 0 ? 1 : 2 };
}

/** The last milestone reached with this many pages revised, or null before the first. */
export function latestMilestone(pagesRevised: number): Milestone | null {
  let last: Milestone | null = null;
  for (const m of MILESTONES) if (pagesRevised >= m) last = m;
  return last;
}

/** The next milestone to reach, or null once every one is reached. */
export function nextMilestone(pagesRevised: number): Milestone | null {
  return MILESTONES.find((m) => pagesRevised < m) ?? null;
}

/** How far from the last milestone (or none) to the next one, 0–1; 1 once every one is reached. */
export function progressToNext(pagesRevised: number): number {
  const next = nextMilestone(pagesRevised);
  if (next == null) return 1;
  const last = latestMilestone(pagesRevised) ?? 0;
  return Math.max(0, Math.min(1, (pagesRevised - last) / (next - last)));
}

/** "Gold II". */
export function badgeName(milestone: Milestone): string {
  const b = badgeOf(milestone);
  return t(`account.badges.name${b.level === 1 ? 'One' : 'Two'}`, { tier: t(`account.badges.tiers.${b.tier}`) });
}

/** The milestone as a badge shows it: "250", "2.5K". */
export function milestoneLabel(milestone: Milestone): string {
  if (milestone < 1000) return formatNumber(milestone);
  return t('account.badges.thousands', { n: formatNumber(milestone / 1000) });
}
