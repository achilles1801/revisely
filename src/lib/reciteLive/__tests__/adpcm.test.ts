// The take's audio, 4:1 (contract "ADPCM uplink", Nov 22 2026): one self-contained IMA-ADPCM block a frame.
import { decodeBlock, encodeBlock } from '../adpcm';

const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, '0')).join('');

describe('IMA-ADPCM blocks', () => {
  it('matches the checker’s reference vector exactly', () => {
    const { block } = encodeBlock(new Int16Array([0, 1000, 2000, 3000, -1000, -3000, 500, 0]), 0);
    expect(hex(block)).toBe('00000000080077f77f09');
  });

  it('a block’s size is 6 + ceil((N − 1) / 2) bytes; 100 ms (1,600 samples) is 806 bytes against 3,200 raw', () => {
    for (const n of [1, 2, 3, 1600, 1601]) expect(encodeBlock(new Int16Array(n)).block.byteLength).toBe(6 + Math.ceil((n - 1) / 2));
  });

  it('decodes to the same length, its first sample exact, and close to a smooth signal', () => {
    const n = 1601;
    const pcm = new Int16Array(n).map((_, i) => Math.round(8000 * Math.sin((2 * Math.PI * 220 * i) / 16000)));
    const out = decodeBlock(encodeBlock(pcm, 0).block);
    expect(out.length).toBe(n);
    expect(out[0]).toBe(pcm[0]);
    // After the step index settles, within a few percent of the signal's range.
    let worst = 0;
    for (let i = 200; i < n; i++) worst = Math.max(worst, Math.abs(out[i] - pcm[i]));
    expect(worst).toBeLessThan(800);
  });

  it('refuses an empty block or one past a uint16 of samples', () => {
    expect(() => encodeBlock(new Int16Array(0))).toThrow();
    expect(() => encodeBlock(new Int16Array(65536))).toThrow();
  });
});
