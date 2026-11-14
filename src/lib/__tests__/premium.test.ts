// Revisely Premium for the account: entitlements/{uid}.premium (apply-support's contract draft 2).
import { act, renderHook } from '@testing-library/react-native';

const mockSnap: { next?: (s: unknown) => void; path?: string; stopped: number } = { stopped: 0 };
jest.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  onSnapshot: (ref: { path: string }, next: (s: unknown) => void) => {
    mockSnap.path = ref.path;
    mockSnap.next = next;
    return () => {
      mockSnap.stopped += 1;
    };
  },
}));
jest.mock('../firebase', () => ({ auth: { currentUser: { uid: 'u1' } }, db: {} }));
const mockCall = jest.fn();
jest.mock('../../services/firestoreService', () => ({ callFunction: (...a: unknown[]) => mockCall(...a) }));

import { hasPremium, parseGrant, premiumErrorText, resetPremiumForTests, setDevPremium, supportLinkUrl, usePremium } from '../premium';

const snap = (data: unknown, fromCache = false) => ({
  exists: () => data != null,
  data: () => data,
  metadata: { fromCache },
});

beforeEach(() => {
  resetPremiumForTests();
  mockSnap.next = undefined;
  mockSnap.path = undefined;
  mockSnap.stopped = 0;
  mockCall.mockReset();
});

describe('Has Premium', () => {
  it('a grant with no end date, or one that ends later; never one that has ended or none', () => {
    const now = 1_000_000;
    expect(hasPremium({ source: 'support', grantedAt: 1, until: null }, now)).toBe(true);
    expect(hasPremium({ source: 'purchase', grantedAt: 1, until: now + 1 }, now)).toBe(true);
    expect(hasPremium({ source: 'gift', grantedAt: 1, until: now }, now)).toBe(false);
    expect(hasPremium(null, now)).toBe(false);
  });

  it('reads the grant as stored; anything that isn’t one is none', () => {
    expect(parseGrant({ source: 'dev', grantedAt: 5, until: null })).toEqual({ source: 'dev', grantedAt: 5, until: null });
    expect(parseGrant({ source: 'family', grantedAt: 5, until: { toMillis: () => 9 } })).toEqual({ source: 'family', grantedAt: 5, until: 9 });
    expect(parseGrant({ source: 'bribe', grantedAt: 5, until: null })).toBeNull();
    expect(parseGrant({ source: 'dev', until: null })).toBeNull();
    expect(parseGrant({ source: 'dev', grantedAt: 5, until: 'soon' })).toBeNull();
    expect(parseGrant(null)).toBeNull();
  });
});

describe('the account’s grant, live', () => {
  it('listens to entitlements/{uid} and follows it; the grants map beside it is ignored', () => {
    const { result, unmount } = renderHook(() => usePremium('u1', true));
    expect(mockSnap.path).toBe('entitlements/u1');
    expect(result.current).toMatchObject({ has: false, known: false });
    act(() => mockSnap.next!(snap({ premium: { source: 'dev', grantedAt: 1, until: null }, grants: { dev: {} } })));
    expect(result.current).toMatchObject({ has: true, known: true, grant: { source: 'dev' } });
    act(() => mockSnap.next!(snap({ grants: {} })));
    expect(result.current).toMatchObject({ has: false, known: true, grant: null });
    unmount();
    expect(mockSnap.stopped).toBe(1);
  });

  it('no document from the server is no Premium; an empty answer from memory is not the server’s', () => {
    const { result } = renderHook(() => usePremium('u1', true));
    act(() => mockSnap.next!(snap(null, true)));
    expect(result.current.known).toBe(false);
    act(() => mockSnap.next!(snap(null)));
    expect(result.current).toMatchObject({ has: false, known: true });
  });

  it('the store app (or a non-tester) reads nothing', () => {
    const { result } = renderHook(() => usePremium('u1', false));
    expect(mockSnap.path).toBeUndefined();
    expect(result.current).toEqual({ has: false, known: false, grant: null });
  });
});

describe('the callables', () => {
  it('Get Premium in Dev and back: devGrantPremium / devRevokePremium, shown at once', async () => {
    const { result } = renderHook(() => usePremium('u1', true));
    act(() => mockSnap.next!(snap(null)));
    mockCall.mockResolvedValueOnce({ result: { premium: true } });
    await act(async () => {
      expect(await setDevPremium(true)).toBe(true);
    });
    expect(mockCall).toHaveBeenLastCalledWith({ uid: 'u1' }, 'devGrantPremium', {}, { timeoutMs: 20_000 });
    expect(result.current).toMatchObject({ has: true, grant: { source: 'dev', until: null } });
    mockCall.mockResolvedValueOnce({ result: { premium: false } });
    await act(async () => {
      expect(await setDevPremium(false)).toBe(false);
    });
    expect(mockCall).toHaveBeenLastCalledWith({ uid: 'u1' }, 'devRevokePremium', {}, { timeoutMs: 20_000 });
    expect(result.current.has).toBe(false);
  });

  it('the support page’s link comes from supportLink; anything but an https link is refused', async () => {
    mockCall.mockResolvedValueOnce({ result: { url: 'https://dev.revisely.app/apply/#c=abc', expiresAt: 1 } });
    await expect(supportLinkUrl()).resolves.toBe('https://dev.revisely.app/apply/#c=abc');
    expect(mockCall).toHaveBeenLastCalledWith({ uid: 'u1' }, 'supportLink', {}, { timeoutMs: 20_000 });
    mockCall.mockResolvedValueOnce({ result: { url: 'javascript:alert(1)' } });
    await expect(supportLinkUrl()).rejects.toMatchObject({ code: 'INTERNAL' });
  });

  it('one short line for each failure', () => {
    expect(premiumErrorText({ code: 'RESOURCE_EXHAUSTED' })).toMatch(/tomorrow/);
    expect(premiumErrorText({ code: 'UNAUTHENTICATED' })).toMatch(/Sign in again/);
    expect(premiumErrorText({ code: 'FAILED_PRECONDITION' })).toBe('Applying for support isn’t open yet.');
    expect(premiumErrorText({ code: 'UNAVAILABLE' })).toMatch(/online/);
    expect(premiumErrorText(new TypeError('Network request failed'))).toMatch(/online/);
    expect(premiumErrorText(new Error('boom'))).toBe('Something went wrong. Try again.');
  });
});
