// Why setup must keep the surahs chosen as surahs (BEHAVIOUR.md ONBOARD-6): the editors' toggles keep a page another chosen
// surah shares when one surah is taken off. With Al-Ikhlas kept, taking An-Nas off keeps the last page; with the empty list
// setup's last answer used to save, the page went, and Al-Ikhlas with it.
import { act, renderHook } from '@testing-library/react-native';
import type { PageStatus } from '../../../lib/memorizationChanges';
import type { UserPage } from '../../../types';
import { useMemorizationToggles } from '../useMemorizationToggles';

const page = (pageNumber: number, status: UserPage['status']): UserPage => ({
  pageNumber,
  status,
  dateMemorized: null,
  weaknessRating: 4,
  lastRevisedDate: null,
  totalRevisionCount: 0,
  skipCount: 0,
});

function takeAnNasOff(baseMemorizedSurahs: number[]): Map<number, PageStatus> {
  let pending = new Map<number, PageStatus>();
  let surahs = new Map<number, PageStatus>();
  const { result } = renderHook(() =>
    useMemorizationToggles({
      pages: [page(1, 'memorized'), page(604, 'memorized')],
      pendingChanges: pending,
      onChange: (next) => (pending = next),
      baseMemorizedSurahs,
      pendingSurahChanges: surahs,
      onSurahChange: (next) => (surahs = next),
    }),
  );
  act(() => result.current.toggleSurah(114, [604]));
  return pending;
}

describe('[ONBOARD-6] a surah chosen in setup keeps the page it shares', () => {
  it('Al-Ikhlas kept as chosen: taking An-Nas off keeps the last page', () => {
    expect(takeAnNasOff([112]).get(604)).toBeUndefined();
  });

  it('with the list setup used to wipe, the page went too', () => {
    expect(takeAnNasOff([]).get(604)).toBe('not_memorized');
  });
});
