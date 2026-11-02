let mockReady = false;
let mockResolve: ((path: string) => void) | null = null;
let mockReject: ((err: Error) => void) | null = null;
let mockProgress: ((p: number) => void) | null = null;
const mockCancel = jest.fn();
const mockDelete = jest.fn();
jest.mock('../speechModel', () => {
  class NotEnoughSpaceError extends Error {}
  return {
    SPEECH_MODEL: { bytes: 59_707_625 },
    NotEnoughSpaceError,
    formatModelSize: () => '57 MB',
    downloadedModelPath: () => (mockReady ? '/models/m.bin' : null),
    deleteModel: () => mockDelete(),
    downloadModel: (onProgress: (p: number) => void) => {
      mockProgress = onProgress;
      return {
        promise: new Promise<string>((res, rej) => {
          mockResolve = res;
          mockReject = rej;
        }),
        cancel: () => {
          mockCancel();
          mockReject?.(new Error('cancelled'));
        },
      };
    },
  };
});

import {
  cancelModelDownload,
  getSpeechModelState,
  removeSpeechModel,
  resetSpeechModelStateForTests,
  startModelDownload,
} from '../speechModelStore';

beforeEach(() => {
  jest.clearAllMocks();
  mockReady = false;
  resetSpeechModelStateForTests();
});

describe('speech model store', () => {
  it('missing, downloading with its progress, then ready', async () => {
    expect(getSpeechModelState()).toEqual({ status: 'missing', error: null });
    const done = startModelDownload();
    expect(getSpeechModelState()).toEqual({ status: 'downloading', progress: 0 });
    mockProgress!(0.42);
    expect(getSpeechModelState()).toEqual({ status: 'downloading', progress: 0.42 });
    // One download at a time.
    startModelDownload();
    mockReady = true;
    mockResolve!('/models/m.bin');
    expect(await done).toBe(true);
    expect(getSpeechModelState()).toEqual({ status: 'ready', bytes: 59_707_625 });
  });

  it('cancelled: missing again, no error', async () => {
    const done = startModelDownload();
    cancelModelDownload();
    expect(mockCancel).toHaveBeenCalled();
    expect(await done).toBe(false);
    expect(getSpeechModelState()).toEqual({ status: 'missing', error: null });
  });

  it('no room or no connection: says what to do', async () => {
    const { NotEnoughSpaceError } = require('../speechModel');
    let done = startModelDownload();
    mockReject!(new NotEnoughSpaceError());
    await done;
    expect(getSpeechModelState()).toEqual({ status: 'missing', error: 'Free up 57 MB or more on this iPhone, then try again.' });
    done = startModelDownload();
    mockReject!(new Error('Download failed (500)'));
    await done;
    expect(getSpeechModelState()).toMatchObject({ status: 'missing', error: expect.stringMatching(/connection/) });
  });

  it('already on the phone: ready at once; delete removes it', async () => {
    mockReady = true;
    expect(getSpeechModelState()).toMatchObject({ status: 'ready' });
    expect(await startModelDownload()).toBe(true);
    removeSpeechModel();
    expect(mockDelete).toHaveBeenCalled();
    expect(getSpeechModelState()).toEqual({ status: 'missing', error: null });
  });
});
