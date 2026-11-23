package app.revisely.reciteengine;

import ai.onnxruntime.NodeInfo;
import ai.onnxruntime.OnnxJavaType;
import ai.onnxruntime.OnnxTensor;
import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtException;
import ai.onnxruntime.OrtSession;
import ai.onnxruntime.TensorInfo;
import ai.onnxruntime.providers.NNAPIFlags;

import java.io.ByteArrayOutputStream;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;
import java.nio.LongBuffer;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * The on-device bench (Revisely Dev, Settings → Testing → On-device model; BEHAVIOUR.md ONDEV-1), Android's twin of
 * ios/RECBenchCore.cpp: loads a model with a provider (cpu, xnnpack, nnapi), checks it on M's vectors, then times
 * N windows of a clip, features and model apart.
 */
public final class Bench {
  private Bench() {}

  public static final class Plan {
    public String model;
    public String provider = "cpu";
    public int threads = 0;
    /** Keys starting "session." go to the session's config; nnapi reads "flags" (USE_FP16,CPU_DISABLED,…); the rest go to the provider. */
    public Map<String, String> options = new HashMap<>();
    public String melFilters, hann, audio;
    public int windows = 60, warmup = 2, windowSamples = 64000, hopSamples = 8000;
    /** Open the model from bytes in memory (as the real path will, after decrypting it), not from its file. */
    public boolean fromMemory;
    /** A second model opened the same way and held while the first is timed (the engine's any-length graph). */
    public String alsoModel;
    /** A long run (research's 20-minute protocol): windows until this many seconds have passed, not `windows`. */
    public int durationSec;
    /** Start a window every this many ms, as a live take does (0: back to back); a window due while one runs is late. */
    public int cadenceMs;
    public String checkPcm, checkMel, checkOut;
    public int checkS0, checkEnd;
  }

  public static final class Result {
    public boolean ok;
    public String error;
    public double loadMs, firstRunMs, reloadMs;
    public final List<Double> featureMs = new ArrayList<>();
    public final List<Double> runMs = new ArrayList<>();
    /** When each timed window started, in ms from the first one. */
    public final List<Double> startMs = new ArrayList<>();
    public int late;
    public final List<String> inputs = new ArrayList<>();
    public long[] outShape = new long[0];
    public double memoryBeforeMb, memoryLoadedMb, memoryAfterMb;
    /** With alsoModel: its open time and the memory with both loaded. */
    public double alsoLoadMs, memoryBothMb;
    public boolean checked;
    public String checkError;
    public int checkFrames;
    public double melMaxDiff, outMaxDiff, outTopSame, ownMaxDiff, ownTopSame;
  }

  public interface Memory {
    double mb();
  }

  public interface Progress {
    void update(int done, int total);
  }

  /** Called at the first timed window and then once a minute, between windows: the platform reads battery and heat. */
  public interface Sampler {
    void sample(double elapsedMs);
  }

  static double nowMs() {
    return System.nanoTime() / 1e6;
  }

  /** java.io, not java.nio.file (Android 8 and later only). */
  static byte[] readAll(String path) throws IOException {
    try (InputStream in = new FileInputStream(path)) {
      ByteArrayOutputStream out = new ByteArrayOutputStream();
      byte[] buf = new byte[1 << 16];
      for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
      return out.toByteArray();
    }
  }

  static float[] readF32(String path, int count) throws IOException {
    byte[] bytes = readAll(path);
    if (bytes.length % 4 != 0 || (count > 0 && bytes.length != count * 4)) {
      throw new IOException(path + ": " + bytes.length + " bytes, expected " + count * 4);
    }
    float[] out = new float[bytes.length / 4];
    ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN).asFloatBuffer().get(out);
    return out;
  }

  static float[] readPcm16(String path) throws IOException {
    byte[] bytes = readAll(path);
    float[] out = new float[bytes.length / 2];
    ByteBuffer b = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN);
    for (int i = 0; i < out.length; i++) out[i] = b.getShort(2 * i) / 32768.0f;
    return out;
  }

  private static final class Model implements AutoCloseable {
    final OrtSession session;
    final List<String> names = new ArrayList<>();
    final List<OnnxJavaType> types = new ArrayList<>();

    Model(OrtSession session) throws OrtException {
      this.session = session;
      for (Map.Entry<String, NodeInfo> e : session.getInputInfo().entrySet()) {
        names.add(e.getKey());
        types.add(((TensorInfo) e.getValue().getInfo()).type);
      }
    }

    @Override
    public void close() throws OrtException {
      session.close();
    }
  }

  private static Model open(OrtEnvironment env, Plan plan) throws OrtException, IOException {
    try (OrtSession.SessionOptions so = new OrtSession.SessionOptions()) {
      if (plan.threads > 0) so.setIntraOpNumThreads(plan.threads);
      so.setInterOpNumThreads(1);
      so.setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT);
      Map<String, String> providerOptions = new HashMap<>();
      for (Map.Entry<String, String> e : plan.options.entrySet()) {
        if (e.getKey().startsWith("session.")) so.addConfigEntry(e.getKey(), e.getValue());
        else providerOptions.put(e.getKey(), e.getValue());
      }
      switch (plan.provider) {
        case "cpu":
          break;
        case "xnnpack":
          so.addXnnpack(providerOptions);
          break;
        case "nnapi": {
          EnumSet<NNAPIFlags> flags = EnumSet.noneOf(NNAPIFlags.class);
          String list = providerOptions.get("flags");
          if (list != null) {
            for (String f : list.split(",")) if (!f.trim().isEmpty()) flags.add(NNAPIFlags.valueOf(f.trim()));
          }
          so.addNnapi(flags);
          break;
        }
        default:
          throw new IllegalArgumentException("unknown provider " + plan.provider);
      }
      // From memory: the bytes are dropped once the session holds its own copy of the weights.
      return new Model(plan.fromMemory ? env.createSession(readAll(plan.model), so) : env.createSession(plan.model, so));
    }
  }

  /** The model's first output, as float32, on [1, 80, frames] features; shape goes in shape[0]. */
  private static float[] run(OrtEnvironment env, Model m, float[] mel, long[][] shape) throws OrtException {
    final int frames = mel.length / LogMel.MELS;
    Map<String, OnnxTensor> inputs = new HashMap<>();
    try {
      for (int i = 0; i < m.names.size(); i++) {
        switch (m.types.get(i)) {
          case FLOAT:
            inputs.put(m.names.get(i), OnnxTensor.createTensor(env, FloatBuffer.wrap(mel), new long[] {1, LogMel.MELS, frames}));
            break;
          case INT64: // the server file's riwaya, zeroed as the server does
            inputs.put(m.names.get(i), OnnxTensor.createTensor(env, LongBuffer.wrap(new long[] {0}), new long[] {1}));
            break;
          default:
            throw new IllegalArgumentException("unexpected input type for " + m.names.get(i));
        }
      }
      try (OrtSession.Result res = m.session.run(inputs)) {
        OnnxTensor out = (OnnxTensor) res.get(0);
        shape[0] = out.getInfo().getShape();
        FloatBuffer fb = out.getFloatBuffer();
        float[] values = new float[fb.remaining()];
        fb.get(values);
        return values;
      }
    } finally {
      for (OnnxTensor t : inputs.values()) t.close();
    }
  }

  private static int argmax(float[] a, int at, int n) {
    int best = 0;
    for (int i = 1; i < n; i++) if (a[at + i] > a[at + best]) best = i;
    return best;
  }

  /** {largest absolute difference, share of frames with the same top sound}. */
  private static double[] compare(float[] a, float[] b, int frames, int sounds) {
    double max = 0;
    int same = 0;
    for (int f = 0; f < frames; f++) {
      for (int s = 0; s < sounds; s++) max = Math.max(max, Math.abs((double) a[f * sounds + s] - b[f * sounds + s]));
      if (argmax(a, f * sounds, sounds) == argmax(b, f * sounds, sounds)) same++;
    }
    return new double[] {max, frames > 0 ? (double) same / frames : 0};
  }

  private static void check(OrtEnvironment env, Plan plan, Model m, LogMel logMel, Result r) {
    try {
      float[] pcm = readPcm16(plan.checkPcm);
      float[] want = readF32(plan.checkMel, 0);
      float[] theirs = readF32(plan.checkOut, 0);
      if (plan.checkS0 < 0 || plan.checkEnd > pcm.length || plan.checkEnd <= plan.checkS0) {
        r.checkError = "check window outside the take";
        return;
      }
      float[] got = logMel.compute(pcm, plan.checkS0, plan.checkEnd - plan.checkS0);
      if (got.length != want.length) {
        r.checkError = "features: " + got.length + " values, the vector has " + want.length;
        return;
      }
      double mel = 0;
      for (int i = 0; i < got.length; i++) mel = Math.max(mel, Math.abs((double) got[i] - want[i]));
      r.melMaxDiff = mel;
      long[][] shape = new long[1][];
      float[] outTheirs = run(env, m, want, shape);
      float[] outOwn = run(env, m, got, shape);
      int sounds = (int) shape[0][shape[0].length - 1];
      int frames = outTheirs.length / sounds;
      if (theirs.length != frames * sounds) {
        r.checkError = "output: " + outTheirs.length + " values, the vector has " + theirs.length;
        return;
      }
      double[] a = compare(outTheirs, theirs, frames, sounds);
      double[] b = compare(outOwn, theirs, frames, sounds);
      r.outMaxDiff = a[0];
      r.outTopSame = a[1];
      r.ownMaxDiff = b[0];
      r.ownTopSame = b[1];
      r.checkFrames = frames;
      r.checked = true;
    } catch (Exception e) {
      r.checkError = String.valueOf(e.getMessage());
    }
  }

  public static Result run(Plan plan, Memory memory, Progress progress) {
    return run(plan, memory, progress, null);
  }

  public static Result run(Plan plan, Memory memory, Progress progress, Sampler sampler) {
    Result r = new Result();
    OrtEnvironment env = OrtEnvironment.getEnvironment();
    try {
      LogMel logMel = new LogMel(readF32(plan.hann, LogMel.FFT), readF32(plan.melFilters, LogMel.MELS * LogMel.BINS));
      float[] audio = readPcm16(plan.audio);
      if (audio.length < plan.windowSamples) {
        r.error = "the clip is shorter than one window";
        return r;
      }
      r.memoryBeforeMb = memory.mb();
      double t0 = nowMs();
      try (Model m = open(env, plan)) {
        r.loadMs = nowMs() - t0;
        r.inputs.addAll(m.names);
        r.memoryLoadedMb = memory.mb();
        Model also = null;
        if (plan.alsoModel != null && !plan.alsoModel.isEmpty()) {
          Plan second = new Plan();
          second.model = plan.alsoModel;
          second.provider = plan.provider;
          second.threads = plan.threads;
          second.options = plan.options;
          second.fromMemory = plan.fromMemory;
          t0 = nowMs();
          also = open(env, second);
          r.alsoLoadMs = nowMs() - t0;
          r.memoryBothMb = memory.mb();
        }
        if (plan.checkPcm != null && !plan.checkPcm.isEmpty()) check(env, plan, m, logMel, r);
        int available = (audio.length - plan.windowSamples) / plan.hopSamples + 1;
        long[][] shape = new long[1][];
        boolean timed = plan.durationSec > 0;
        double begin = 0, due = 0, nextSample = 0;
        for (int i = 0; ; i++) {
          boolean warm = i < plan.warmup;
          if (!warm) {
            int done = i - plan.warmup;
            if (done == 0) begin = due = nowMs();
            double elapsed = nowMs() - begin;
            if (timed ? elapsed >= plan.durationSec * 1000.0 : done >= plan.windows) break;
            if (sampler != null && elapsed >= nextSample) {
              sampler.sample(elapsed);
              nextSample += 60000.0;
            }
            if (plan.cadenceMs > 0) {
              if (done > 0) due += plan.cadenceMs;
              double now = nowMs();
              if (now < due) {
                Thread.sleep((long) (due - now), (int) (((due - now) % 1) * 1e6));
              } else if (done > 0 && now > due + 1.0) {
                r.late++;
                due = now;
              }
            }
          }
          int start = (i % available) * plan.hopSamples;
          t0 = nowMs();
          float[] mel = logMel.compute(audio, start, plan.windowSamples);
          double t1 = nowMs();
          run(env, m, mel, shape);
          double t2 = nowMs();
          if (i == 0) r.firstRunMs = t2 - t1;
          if (!warm) {
            r.startMs.add(t0 - begin);
            r.featureMs.add(t1 - t0);
            r.runMs.add(t2 - t1);
            if (progress != null) {
              if (timed) progress.update((int) ((t2 - begin) / 1000.0), plan.durationSec);
              else progress.update(i - plan.warmup + 1, plan.windows);
            }
          }
        }
        if (sampler != null) sampler.sample(nowMs() - begin);
        r.outShape = shape[0];
        r.memoryAfterMb = memory.mb();
        if (also != null) also.close();
      }
      // Opened again, as iOS does for Core ML's cache (on Android: the file is warm in the page cache).
      t0 = nowMs();
      Model again = open(env, plan);
      r.reloadMs = nowMs() - t0;
      again.close();
      r.ok = true;
    } catch (Exception e) {
      r.error = e.getClass().getSimpleName() + ": " + e.getMessage();
    } catch (OutOfMemoryError e) {
      r.error = "out of memory";
    }
    return r;
  }
}
