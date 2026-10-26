import React, { useMemo } from 'react';
import { computeMemorizationStats, formatFractional } from '../../../lib/memorizationStats';
import type { HomeMetric } from '../../../lib/homePrefs';
import type { UserPage } from '../../../types';
import { Mark } from '../../v2/Mark';
import { RowText, ThreadRow } from '../../v2/ThreadRow';

/** "6.2 of 30 juz · 123 of 604 pages", in the order Settings → Home screen chose. */
export function memorizedText(pages: UserPage[], metrics: HomeMetric[]) {
  const stats = computeMemorizationStats(pages);
  const percent = (stats.pages / 604) * 100;
  const parts: Record<HomeMetric, string> = {
    juz: `${formatFractional(stats.fractionalJuz)} of 30 juz`,
    pages: `${stats.pages} of 604 pages`,
    surahs: `${stats.surahs} of 114 surahs`,
  };
  const shown = (metrics.length > 0 ? metrics : (['juz', 'pages'] as HomeMetric[])).map((m) => parts[m]);
  return {
    body: shown.join(' · '),
    meta: `${percent < 1 && percent > 0 ? '<1' : Math.round(percent)}% of the Quran`,
  };
}

/** Memorization on Home, as one post. Opens the memorized-pages manager. */
export function MemorizedPost({
  pages,
  metrics,
  onPress,
}: {
  pages: UserPage[];
  metrics: HomeMetric[];
  onPress: () => void;
}) {
  const t = useMemo(() => memorizedText(pages, metrics), [pages, metrics]);
  return (
    <ThreadRow
      mark={<Mark icon="book-outline" />}
      name="Memorized"
      meta={t.meta}
      onPress={onPress}
      accessibilityLabel={`Memorized: ${t.body}, ${t.meta}. Open memorization`}
      testID="memorized-post"
    >
      <RowText>{t.body}</RowText>
    </ThreadRow>
  );
}
