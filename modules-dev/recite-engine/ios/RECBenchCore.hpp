// The on-device bench's core (Revisely Dev, Settings → Testing → On-device model; BEHAVIOUR.md ONDEV-1).
//
// Plain C++17 on ONNX Runtime's C++ API, so the same file runs inside the app (RECBench.mm) and on a Mac against
// ONNX Runtime's desktop build of the same version. The features follow workstream M's spec
// (~/revisely-mistake-lab/runs/mobile/SPEC.md §2): 0.4 s of zeros either side of the window, numpy's reflect
// padding of 200, frames of 400 every 160, the shipped periodic Hann window and mel table, log10 floored at the
// window's largest value − 8, then (value + 4) / 4, an even frame count.
#pragma once

#include <cstdint>
#include <functional>
#include <map>
#include <string>
#include <vector>

namespace rec {

constexpr int kSampleRate = 16000;
constexpr int kMels = 80;
constexpr int kFft = 400;
constexpr int kBins = kFft / 2 + 1;
constexpr int kStep = 160;
constexpr int kSilence = 6400;  // 0.4 s of zeros either side of a window
constexpr int kReflect = 200;

/** Reads `count` little-endian float32 values (count 0: the whole file). */
bool readF32(const std::string& path, size_t count, std::vector<float>& out, std::string& error);
/** Reads raw 16 kHz mono little-endian int16 as float32 (sample / 32768). */
bool readPcm16(const std::string& path, std::vector<float>& out, std::string& error);

/** A 400-point FFT of real input (mixed radix, double precision, as numpy's rfft is on float64). */
class Fft {
 public:
  Fft();
  /** in: 400 samples; power: 201 bins of |X|^2. */
  void power(const double* in, double* power);

 private:
  void step(const double* in, int stride, int n, int out, int factor, int twStride);
  std::vector<int> factors_;
  std::vector<double> twRe_, twIm_, re_, im_;
};

/** Whisper's log-mel for one window, with M's shipped tables. */
class LogMel {
 public:
  LogMel(std::vector<float> hann, std::vector<float> filters);
  /** Fills out with [80, frames] row-major and returns frames (even). */
  int compute(const float* window, size_t n, std::vector<float>& out);

 private:
  std::vector<float> hann_, filters_;
  /** Each filter's non-zero bins, [from, to): the table is mostly zeros. */
  std::vector<int> from_, to_;
  Fft fft_;
  std::vector<double> padded_, frame_, power_, logs_;
};

struct Plan {
  std::string model;
  /** cpu, coreml, xnnpack. */
  std::string provider = "cpu";
  /** Intra-op threads; 0 leaves ONNX Runtime's default. */
  int threads = 0;
  /** Keys starting "session." go to the session's config, the rest to the provider. */
  std::map<std::string, std::string> options;
  /** Core ML's compiled-model cache. */
  std::string cacheDir;
  std::string melFilters, hann;
  /** The clip to time: raw pcm16. */
  std::string audio;
  int windows = 60;
  int warmup = 2;
  int windowSamples = 64000;
  int hopSamples = 8000;
  /** Parity on M's vectors (empty: skipped): the take, its window, the features and the model's output there. */
  std::string checkPcm, checkMel, checkOut;
  int checkS0 = 0, checkEnd = 0;
};

struct Result {
  bool ok = false;
  std::string error;
  /** The first open, the first run, and a second open after the timed windows (Core ML: from its cache). */
  double loadMs = 0, firstRunMs = 0, reloadMs = 0;
  std::vector<double> featureMs, runMs;
  std::vector<std::string> inputs;
  std::vector<int64_t> outShape;
  double memoryBeforeMb = 0, memoryLoadedMb = 0, memoryAfterMb = 0;
  bool checked = false;
  std::string checkError;
  int checkFrames = 0;
  /** Features from the take against M's features; the model on M's features, and on ours, against M's output. */
  double melMaxDiff = 0, outMaxDiff = 0, outTopSame = 0, ownMaxDiff = 0, ownTopSame = 0;
};

/** Loads the model with the plan's provider and times it. progress(done, total) after each timed window. */
Result runPlan(const Plan& plan, const std::function<double()>& memoryMb, const std::function<void(int, int)>& progress);

}  // namespace rec
