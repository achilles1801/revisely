// A live take's audio kept as a recording: a WAV file written as the samples come, then a reading recording.

const mockFiles = new Map<string, Uint8Array>();
let mockFailWrites = false;

jest.mock('expo-file-system', () => {
  class FileHandle {
    offset: number | null = 0;
    uri: string;
    constructor(path: string) {
      this.uri = path;
    }
    get size() {
      return mockFiles.get(this.uri)?.length ?? 0;
    }
    writeBytes(bytes: Uint8Array) {
      if (mockFailWrites) throw new Error('ENOSPC');
      const at = this.offset ?? 0;
      const old = mockFiles.get(this.uri) ?? new Uint8Array(0);
      const next = new Uint8Array(Math.max(old.length, at + bytes.length));
      next.set(old, 0);
      next.set(bytes, at);
      mockFiles.set(this.uri, next);
      this.offset = at + bytes.length;
    }
    close() {}
  }
  class File {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = parts.map((p) => (typeof p === 'string' ? p : (p as { uri: string }).uri)).join('/');
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    create() {
      mockFiles.set(this.uri, new Uint8Array(0));
    }
    write(content: Uint8Array) {
      mockFiles.set(this.uri, new Uint8Array(content));
    }
    open() {
      return new FileHandle(this.uri);
    }
    delete() {
      mockFiles.delete(this.uri);
    }
  }
  return { File, Paths: { cache: { uri: 'cache' } } };
});

const mockAppend = jest.fn();
jest.mock('../../recordings', () => ({ appendSegment: (...args: unknown[]) => mockAppend(...args) }));

import { startTakeRecording, windowLevel } from '../takeRecording';

const tone = (n: number, amplitude = 8000) => Int16Array.from({ length: n }, (_, i) => Math.round(amplitude * Math.sin(i / 5)));
const u32 = (b: Uint8Array, at: number) => new DataView(b.buffer, b.byteOffset).getUint32(at, true);

beforeEach(() => {
  mockFiles.clear();
  mockFailWrites = false;
  mockAppend.mockReset();
  mockAppend.mockResolvedValue({ id: 'rec-1', kept: true, restarted: false });
});

describe('a take kept as a recording', () => {
  it('writes the samples to a WAV file as they come and saves it as a reading recording, with its pages', async () => {
    const take = startTakeRecording({ day: '2026-11-14', page: 379, now: 1000 });
    const a = tone(16000 * 2);
    const b = tone(8000, 3000);
    take.add(a.subarray(0, 12000));
    take.add(a.subarray(12000));
    take.pageAt(379);
    take.pageAt(380);
    take.add(b);
    const saved = await take.finish();
    expect(saved).toEqual({ day: '2026-11-14', recordingId: 'rec-1' });

    const [id, uri, info] = mockAppend.mock.calls[0];
    expect(id).toBeNull();
    expect(uri).toMatch(/^cache\/recite-take-1000-[a-z0-9]+\.wav$/);
    expect(info).toMatchObject({
      kind: 'reading',
      day: '2026-11-14',
      segmentMs: 2500,
      createdAt: 1000,
      pageMarks: [
        { atMs: 0, page: 379 },
        { atMs: 2000, page: 380 },
      ],
    });
    expect(info.levels.length).toBeGreaterThan(0);

    const wav = mockFiles.get(uri) as Uint8Array;
    const dataBytes = (a.length + b.length) * 2;
    expect(String.fromCharCode(...wav.subarray(0, 4))).toBe('RIFF');
    expect(u32(wav, 4)).toBe(36 + dataBytes);
    expect(u32(wav, 24)).toBe(16000);
    expect(u32(wav, 40)).toBe(dataBytes);
    expect(wav.length).toBe(44 + dataBytes);
    const back = new Int16Array(wav.buffer.slice(44));
    expect(back.subarray(0, a.length)).toEqual(a);
    expect(back.subarray(a.length)).toEqual(b);
  });

  it('nothing heard: no recording, and the file goes', async () => {
    const take = startTakeRecording({ day: '2026-11-14', page: 1 });
    expect(await take.finish()).toBeNull();
    expect(mockAppend).not.toHaveBeenCalled();
    expect(mockFiles.size).toBe(0);
  });

  it('a phone too full to write: no recording, the take goes on, the file goes', async () => {
    const take = startTakeRecording({ day: '2026-11-14', page: 1 });
    mockFailWrites = true;
    expect(() => take.add(tone(20000))).not.toThrow();
    take.add(tone(20000));
    expect(await take.finish()).toBeNull();
    expect(mockAppend).not.toHaveBeenCalled();
    expect(mockFiles.size).toBe(0);
  });

  it('too short to keep (the recordings’ own minimum): nothing to show', async () => {
    mockAppend.mockResolvedValue({ id: null, kept: false, restarted: false });
    const take = startTakeRecording({ day: '2026-11-14', page: 1 });
    take.add(tone(4000));
    expect(await take.finish()).toBeNull();
  });

  it('finishes once', async () => {
    const take = startTakeRecording({ day: '2026-11-14', page: 1 });
    take.add(tone(32000));
    await take.finish();
    expect(await take.finish()).toBeNull();
    expect(mockAppend).toHaveBeenCalledTimes(1);
  });
});

describe('the waveform', () => {
  it('silence is 0, full scale 1, and loudness between by decibels', () => {
    expect(windowLevel(0, 1600)).toBe(0);
    expect(windowLevel(32768 * 32768 * 1600, 1600)).toBeCloseTo(1);
    // -25 dBFS is halfway down to the floor (-50).
    const rms = 32768 * 10 ** (-25 / 20);
    expect(windowLevel(rms * rms * 1600, 1600)).toBeCloseTo(0.5);
    expect(windowLevel(0, 0)).toBe(0);
  });
});
