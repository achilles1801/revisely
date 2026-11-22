// A take's recording read back by the take's seconds: a past take's word (clipOfTake), and a long recitation's earlier
// takes after Stop (takeFile, RECITE-22).

const mockFiles = new Map<string, Uint8Array>();

jest.mock('expo-file-system', () => {
  class FileHandle {
    offset = 0;
    uri: string;
    constructor(path: string) {
      this.uri = path;
    }
    readBytes(n: number) {
      const out = (mockFiles.get(this.uri) ?? new Uint8Array(0)).slice(this.offset, this.offset + n);
      this.offset += out.length;
      return out;
    }
    close() {}
  }
  class File {
    uri: string;
    constructor(path: string) {
      this.uri = path;
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    get size() {
      return mockFiles.get(this.uri)?.length ?? 0;
    }
    open() {
      return new FileHandle(this.uri);
    }
  }
  return { File };
});

const mockRecordings: { id: string; segments: { uri: string; fileName: string; local: boolean }[] }[] = [];
jest.mock('../../recordings', () => ({
  listRecordings: async () => mockRecordings,
  onRecordingsChanged: () => () => undefined,
}));

import { clipOfTake, takeFile } from '../takeAudio';

const SR = 16000;
/** A 16 kHz WAV whose sample i is i (mod 32768): where a read starts and ends shows in its values. */
function wav(seconds: number): Uint8Array {
  const n = seconds * SR;
  const bytes = new Uint8Array(44 + n * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < n; i++) view.setInt16(44 + i * 2, i % 32768, true);
  return bytes;
}

beforeEach(() => {
  mockFiles.clear();
  mockRecordings.length = 0;
  mockRecordings.push({ id: 'rec-1', segments: [{ uri: 'file:///recordings/rec-1-1.wav', fileName: 'rec-1-1.wav', local: true }] });
  mockFiles.set('file:///recordings/rec-1-1.wav', wav(2));
});

describe('a take’s recording read back', () => {
  it('[RECITE-22] by the take’s seconds, within the file', async () => {
    const file = await takeFile('rec-1');
    expect(file?.there()).toBe(true);
    const pcm = file!.read(0.5, 1)!;
    expect(pcm.length).toBe(SR / 2);
    expect(pcm[0]).toBe(SR / 2);
    expect(file!.read(1.5, 9)!.length).toBe(SR / 2);
    expect(file!.read(3, 4)).toBeNull();
  });

  it('[RECITE-22] gone (the take or its recording deleted): nothing there, nothing read', async () => {
    const file = await takeFile('rec-1');
    mockFiles.clear();
    expect(file!.there()).toBe(false);
    expect(file!.read(0, 1)).toBeNull();
    expect(await takeFile('rec-2')).toBeNull();
  });

  it('a past take’s word: from 0.7 s before it to 0.9 s after', async () => {
    const pcm = (await clipOfTake('rec-1', 1))!;
    expect(pcm.length).toBe(Math.round(1.6 * SR));
    expect(pcm[0]).toBe(Math.round(0.3 * SR));
  });
});
