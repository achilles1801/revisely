import { User, UserPage, QuranPage, DailyAssignment } from '../types';

/**
 * Calculate urgency score for a single page.
 * Higher score = more urgent to revise.
 */
export function calculatePageUrgency(
  page: UserPage,
  user: User,
  today: Date = new Date()
): number {
  // Skip non-memorized pages
  if (page.status !== 'memorized' || !page.lastRevisedDate) {
    return 0;
  }

  const lastRevised = new Date(page.lastRevisedDate);
  const daysSinceRevision = Math.floor(
    (today.getTime() - lastRevised.getTime()) / (1000 * 60 * 60 * 24)
  );

  // 1. Base time urgency
  const timeUrgency = daysSinceRevision / user.dangerThresholdDays;

  // 2. Recency multiplier (new pages need more attention)
  let recencyMultiplier = 1.0;
  if (page.dateMemorized) {
    const dateMemorized = new Date(page.dateMemorized);
    const daysSinceMemorized = Math.floor(
      (today.getTime() - dateMemorized.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSinceMemorized < 30) {
      recencyMultiplier = 2.0 - (daysSinceMemorized / 30);
    }
  }

  // 3. Weakness multiplier (weak pages get priority)
  const weaknessMultiplier = (6 - page.weaknessRating) / 5;

  // 4. Skip penalty (don't keep pushing back the same pages)
  const skipPenalty = 1 + (page.skipCount * 0.2);

  return timeUrgency * recencyMultiplier * weaknessMultiplier * skipPenalty;
}

/**
 * Generate daily revision assignment.
 */
export function generateDailyAssignment(
  pages: UserPage[],
  quranData: QuranPage[],
  user: User,
  today: Date = new Date()
): DailyAssignment {
  // Calculate urgency for all memorized pages
  const pagesWithUrgency = pages
    .filter(p => p.status === 'memorized')
    .map(p => ({
      page: p,
      urgency: calculatePageUrgency(p, user, today),
    }))
    .sort((a, b) => b.urgency - a.urgency);

  // Select top N pages based on capacity
  const selectedPages = pagesWithUrgency
    .slice(0, user.dailyPageCapacity)
    .map(p => p.page.pageNumber)
    .sort((a, b) => a - b);

  // Group by juz for display
  const juzMap = new Map<number, number[]>();
  for (const pageNum of selectedPages) {
    const quranPage = quranData.find(q => q.pageNumber === pageNum);
    if (quranPage) {
      const existing = juzMap.get(quranPage.juzNumber) || [];
      existing.push(pageNum);
      juzMap.set(quranPage.juzNumber, existing);
    }
  }

  const juzBreakdown = Array.from(juzMap.entries())
    .map(([juz, pages]) => ({ juz, pages }))
    .sort((a, b) => a.juz - b.juz);

  return {
    date: today.toISOString().split('T')[0],
    pages: selectedPages,
    juzBreakdown,
    totalPages: selectedPages.length,
    estimatedMinutes: Math.round(selectedPages.length * 1.25), // ~1.25 min per page
  };
}

/**
 * Update user's danger threshold based on observed decay.
 * Called when user reports a weakness rating drop.
 */
export function updateDangerThreshold(
  user: User,
  decayDataPoints: number[] // days until decay was observed
): number {
  if (decayDataPoints.length < 10) {
    return user.dangerThresholdDays; // Not enough data yet
  }

  // Use 25th percentile for conservative estimate
  const sorted = [...decayDataPoints].sort((a, b) => a - b);
  const index = Math.floor(sorted.length * 0.25);
  const newThreshold = sorted[index];

  // Clamp between 5 and 30 days
  return Math.max(5, Math.min(30, newThreshold));
}

