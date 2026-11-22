import React, { forwardRef, useMemo, useState } from 'react';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { ListPickerSheet, PickerItem, PickerTab } from './ListPickerSheet';
import { memorizedJuzGroups, memorizedSurahGroups, pageCountLabel } from '../../lib/planDisplay';
import { describePageRange, describePassage } from '../../lib/passages';
import type { PlanDirection } from '../../lib/planBuilder';
import { t } from '../../i18n';

/**
 * Edit schedule's "Today starts at" (SCHED-8): a surah, a juz or a page of what's memorized. A surah or juz starts
 * at its first page, or its last when the order is An-Nas to Al-Fatihah.
 */
export const StartPickerSheet = forwardRef<
  BottomSheetModal,
  { memorized: number[]; startPage: number | null; direction: PlanDirection; onPick: (page: number) => void }
>(function StartPickerSheet({ memorized, startPage, direction, onPick }, ref) {
  const [tab, setTab] = useState('surah');
  const surahGroups = useMemo(() => memorizedSurahGroups(memorized), [memorized]);
  const juzGroups = useMemo(() => memorizedJuzGroups(memorized), [memorized]);

  const tabs = useMemo<PickerTab[]>(() => {
    const at = (pages: number[]) => (direction === 'reverse' ? pages[pages.length - 1] : pages[0]);
    const surahItems: PickerItem[] = surahGroups.map((g) => ({
      key: `surah:${g.number}`,
      index: String(g.number),
      title: g.name,
      subtitle:
        g.pages.length === g.totalPages
          ? pageCountLabel(g.pages.length)
          : t('plan.start.ofPagesMemorized', { have: g.pages.length, total: g.totalPages }),
      trailing: g.nameArabic,
      search: `${g.number}`,
      checked: startPage != null && at(g.pages) === startPage,
    }));
    const juzItems: PickerItem[] = juzGroups.map((g) => ({
      key: `juz:${g.juz}`,
      index: String(g.juz),
      title: t('common.juzN', { n: g.juz }),
      subtitle: `${describePassage(g.pages, { form: 'short', wholeJuz: false, max: 2 })} · ${pageCountLabel(g.pages.length)}`,
      trailing: g.name,
      search: `${g.juz}`,
      checked: startPage != null && at(g.pages) === startPage,
    }));
    const pageItems: PickerItem[] = memorized.map((p) => ({
      key: `page:${p}`,
      // Chosen by page (the Page tab): the number leads, the surah and juz follow.
      title: t('common.pageN', { n: p }),
      subtitle: describePageRange(p, p, { juz: true }),
      checked: startPage === p,
    }));
    return [
      { key: 'surah', label: t('common.surah'), items: surahItems },
      { key: 'juz', label: t('common.juz'), items: juzItems },
      { key: 'page', label: t('common.page'), items: pageItems },
    ];
  }, [surahGroups, juzGroups, memorized, startPage, direction]);

  const pick = (key: string) => {
    const [kind, raw] = key.split(':');
    const n = Number(raw);
    const pages =
      kind === 'surah'
        ? surahGroups.find((g) => g.number === n)?.pages
        : kind === 'juz'
          ? juzGroups.find((g) => g.juz === n)?.pages
          : [n];
    if (!pages || pages.length === 0) return;
    onPick(direction === 'reverse' ? pages[pages.length - 1] : pages[0]);
    (ref as React.RefObject<BottomSheetModal | null>)?.current?.dismiss();
  };

  return (
    <ListPickerSheet
      ref={ref}
      title={t('plan.edit.todayStartsAt')}
      tabs={tabs}
      activeTab={tab}
      onTabChange={setTab}
      onSelect={pick}
      onLeft={() => (ref as React.RefObject<BottomSheetModal | null>)?.current?.dismiss()}
      searchPlaceholder={t('plan.start.search')}
      footer={t('plan.start.footer')}
    />
  );
});
