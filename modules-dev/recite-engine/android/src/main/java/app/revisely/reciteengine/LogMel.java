package app.revisely.reciteengine;

/**
 * Whisper's log-mel for one window, as workstream M's spec has it (~/revisely-mistake-lab/runs/mobile/SPEC.md §2):
 * 0.4 s of zeros either side of the window, numpy's reflect padding of 200, frames of 400 every 160, the shipped
 * periodic Hann window and mel table, log10 floored at the window's largest value − 8, then (value + 4) / 4, an even
 * frame count. The same steps as the iOS core (ios/RECBenchCore.cpp). Plain Java, so it also runs on a Mac.
 */
public final class LogMel {
  public static final int MELS = 80;
  public static final int FFT = 400;
  public static final int BINS = FFT / 2 + 1;
  static final int STEP = 160;
  static final int SILENCE = 6400;
  static final int REFLECT = 200;

  private final float[] hann;
  private final float[] filters;
  private final int[] from = new int[MELS];
  private final int[] to = new int[MELS];
  private final Fft fft = new Fft();
  private final double[] frame = new double[FFT];
  private final double[] power = new double[BINS];
  private double[] padded = new double[0];
  private double[] logs = new double[0];

  public LogMel(float[] hann, float[] filters) {
    if (hann.length != FFT || filters.length != MELS * BINS) throw new IllegalArgumentException("table sizes");
    this.hann = hann;
    this.filters = filters;
    for (int b = 0; b < MELS; b++) {
      int lo = BINS, hi = 0;
      for (int k = 0; k < BINS; k++) {
        if (filters[b * BINS + k] != 0f) {
          lo = Math.min(lo, k);
          hi = k + 1;
        }
      }
      from[b] = lo < hi ? lo : 0;
      to[b] = lo < hi ? hi : 0;
    }
  }

  /** The features of window[offset, offset + n), [80, frames] row-major; returns them (frames = length / 80). */
  public float[] compute(float[] window, int offset, int n) {
    final int yLen = n + 2 * SILENCE;
    final int len = yLen + 2 * REFLECT;
    if (padded.length != len) padded = new double[len];
    for (int i = 0; i < len; i++) {
      int j;
      if (i < REFLECT) j = REFLECT - i;
      else if (i >= REFLECT + yLen) j = yLen - 2 - (i - REFLECT - yLen);
      else j = i - REFLECT;
      padded[i] = j >= SILENCE && j < SILENCE + n ? window[offset + j - SILENCE] : 0.0;
    }
    final int frames = 1 + (len - FFT) / STEP;
    if (logs.length != MELS * frames) logs = new double[MELS * frames];
    double top = Double.NEGATIVE_INFINITY;
    for (int f = 0; f < frames; f++) {
      final int src = f * STEP;
      for (int k = 0; k < FFT; k++) frame[k] = padded[src + k] * hann[k];
      fft.power(frame, power);
      for (int b = 0; b < MELS; b++) {
        double v = 0;
        final int row = b * BINS;
        for (int k = from[b]; k < to[b]; k++) v += filters[row + k] * power[k];
        final double l = Math.log10(Math.max(v, 1e-10));
        logs[b * frames + f] = l;
        if (l > top) top = l;
      }
    }
    // The floor counts every frame, the odd last one too (as numpy computes it before the crop).
    final double floor = top - 8.0;
    final int even = frames - frames % 2;
    final float[] out = new float[MELS * even];
    for (int b = 0; b < MELS; b++) {
      for (int f = 0; f < even; f++) out[b * even + f] = (float) ((Math.max(logs[b * frames + f], floor) + 4.0) / 4.0);
    }
    return out;
  }

  /** A 400-point FFT of real input: mixed radix, decimation in time, double precision (as numpy's rfft on float64). */
  static final class Fft {
    private final int[] factors;
    private final double[] twRe = new double[FFT];
    private final double[] twIm = new double[FFT];
    private final double[] re = new double[FFT];
    private final double[] im = new double[FFT];
    private final double[] tRe = new double[16];
    private final double[] tIm = new double[16];

    Fft() {
      int n = FFT;
      int[] found = new int[32];
      int count = 0;
      for (int p : new int[] {4, 2, 3, 5}) {
        while (n % p == 0) {
          found[count++] = p;
          n /= p;
        }
      }
      for (int p = 7; n > 1; p++) {
        while (n % p == 0) {
          found[count++] = p;
          n /= p;
        }
      }
      factors = java.util.Arrays.copyOf(found, count);
      for (int j = 0; j < FFT; j++) {
        final double a = 2.0 * Math.PI * j / FFT;
        twRe[j] = Math.cos(a);
        twIm[j] = -Math.sin(a);
      }
    }

    void power(double[] in, double[] power) {
      step(in, 0, 1, FFT, 0, 0, 1);
      for (int k = 0; k < BINS; k++) power[k] = re[k] * re[k] + im[k] * im[k];
    }

    // The n inputs in[at], in[at + stride], … become p interleaved sub-transforms of m = n / p points at out + r·m;
    // then X[k + q·m] = Σ_r W_n^(r·k) · W_p^(r·q) · Y_r[k], in place, one k at a time.
    private void step(double[] in, int at, int stride, int n, int out, int factor, int twStride) {
      if (n == 1) {
        re[out] = in[at];
        im[out] = 0;
        return;
      }
      final int p = factors[factor];
      final int m = n / p;
      for (int r = 0; r < p; r++) step(in, at + r * stride, stride * p, m, out + r * m, factor + 1, twStride * p);
      final int unit = FFT / p;
      for (int k = 0; k < m; k++) {
        for (int r = 0; r < p; r++) {
          final int i = out + r * m + k;
          final int w = (r * k * twStride) % FFT;
          tRe[r] = re[i] * twRe[w] - im[i] * twIm[w];
          tIm[r] = re[i] * twIm[w] + im[i] * twRe[w];
        }
        for (int q = 0; q < p; q++) {
          double sRe = 0, sIm = 0;
          for (int r = 0; r < p; r++) {
            final int w = ((r * q) % p) * unit;
            sRe += tRe[r] * twRe[w] - tIm[r] * twIm[w];
            sIm += tRe[r] * twIm[w] + tIm[r] * twRe[w];
          }
          re[out + q * m + k] = sRe;
          im[out + q * m + k] = sIm;
        }
      }
    }
  }
}
