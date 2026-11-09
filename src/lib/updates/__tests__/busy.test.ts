let mockReady = true;
let mockRoute: string | undefined = 'Dashboard';
const mockNavListeners: Array<() => void> = [];
jest.mock('../../../navigation/navigationRef', () => ({
  navigationRef: {
    isReady: () => mockReady,
    getCurrentRoute: () => (mockRoute ? { name: mockRoute } : undefined),
    addListener: (_e: string, cb: () => void) => {
      mockNavListeners.push(cb);
      return () => undefined;
    },
  },
}));
let mockRecitation = { status: 'idle', verse: null as null | { surah: number; ayah: number } };
const mockRecitationListeners: Array<() => void> = [];
jest.mock('../../recitation', () => ({
  getRecitation: () => ({
    getState: () => mockRecitation,
    subscribe: (cb: () => void) => {
      mockRecitationListeners.push(cb);
      return () => undefined;
    },
  }),
}));

// Required, not imported: busy.ts subscribes when it loads, and imports would
// run before the listener arrays above exist.
/* eslint-disable @typescript-eslint/no-require-imports */
const { acquireRecording, releaseRecording } = require('../../recordings') as typeof import('../../recordings');
const { busyReasons, resetBusyForTests, setBusy, subscribeBusy } = require('../busy') as typeof import('../busy');
/* eslint-enable @typescript-eslint/no-require-imports */

beforeEach(() => {
  resetBusyForTests();
  mockReady = true;
  mockRoute = 'Dashboard';
  mockRecitation = { status: 'idle', verse: null };
  releaseRecording('reader');
});

describe('busyReasons', () => {
  it('nothing on a tab main screen with nothing going on', () => {
    for (const route of ['Dashboard', 'ReadIndex', 'Insights']) {
      mockRoute = route;
      expect(busyReasons()).toEqual([]);
    }
  });

  it('any other screen (a session, the reader, an editor), or none yet (sign-in, loading)', () => {
    for (const route of ['ActiveRevision', 'QuranReader', 'JournalEntry', 'Settings', 'PlanEdit', 'Welcome']) {
      mockRoute = route;
      expect(busyReasons()).toEqual(['screen']);
    }
    mockRoute = undefined;
    expect(busyReasons()).toEqual(['screen']);
    mockReady = false;
    mockRoute = 'Dashboard';
    expect(busyReasons()).toEqual(['screen']);
  });

  it('a recording session, recording or paused, on any tab', () => {
    acquireRecording('reader');
    expect(busyReasons()).toEqual(['recording']);
    releaseRecording('reader');
    expect(busyReasons()).toEqual([]);
  });

  it('a recitation playing or paused (the mini player shows it)', () => {
    mockRecitation = { status: 'paused', verse: { surah: 2, ayah: 13 } };
    expect(busyReasons()).toEqual(['recitation']);
  });

  it('a timer', () => {
    setBusy('timer', true);
    expect(busyReasons()).toEqual(['timer']);
    setBusy('timer', false);
    expect(busyReasons()).toEqual([]);
  });

  it('tells subscribers when any of them changes', () => {
    const l = jest.fn();
    const off = subscribeBusy(l);
    setBusy('timer', true);
    acquireRecording('reader');
    mockNavListeners.forEach((cb) => cb());
    mockRecitationListeners.forEach((cb) => cb());
    expect(l).toHaveBeenCalledTimes(4);
    off();
    setBusy('timer', false);
    expect(l).toHaveBeenCalledTimes(4);
  });
});
