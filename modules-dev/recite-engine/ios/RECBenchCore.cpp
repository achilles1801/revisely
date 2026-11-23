// See RECBenchCore.hpp.
#include "RECBenchCore.hpp"

#if __has_include(<onnxruntime/onnxruntime_cxx_api.h>)
#include <onnxruntime/onnxruntime_cxx_api.h>
#else
#include <onnxruntime_cxx_api.h>
#endif

#include <algorithm>
#include <chrono>
#include <cmath>
#include <fstream>
#include <memory>
#include <stdexcept>
#include <unordered_map>

namespace rec {

namespace {

double nowMs() {
  using namespace std::chrono;
  return duration<double, std::milli>(steady_clock::now().time_since_epoch()).count();
}

bool readBytes(const std::string& path, std::vector<char>& out, std::string& error) {
  std::ifstream f(path, std::ios::binary | std::ios::ate);
  if (!f) {
    error = "can't open " + path;
    return false;
  }
  const auto size = f.tellg();
  out.resize(static_cast<size_t>(size));
  f.seekg(0);
  if (size > 0 && !f.read(out.data(), size)) {
    error = "can't read " + path;
    return false;
  }
  return true;
}

int argmax(const float* row, int n) {
  int best = 0;
  for (int i = 1; i < n; i++)
    if (row[i] > row[best]) best = i;
  return best;
}

/** Largest absolute difference, and the share of frames whose top sound is the same. */
void compare(const float* a, const float* b, int frames, int sounds, double& maxDiff, double& topSame) {
  maxDiff = 0;
  int same = 0;
  for (int f = 0; f < frames; f++) {
    const float* ra = a + static_cast<size_t>(f) * sounds;
    const float* rb = b + static_cast<size_t>(f) * sounds;
    for (int s = 0; s < sounds; s++) maxDiff = std::max(maxDiff, std::fabs(static_cast<double>(ra[s]) - rb[s]));
    if (argmax(ra, sounds) == argmax(rb, sounds)) same++;
  }
  topSame = frames > 0 ? static_cast<double>(same) / frames : 0;
}

Ort::Env& env() {
  static Ort::Env e(ORT_LOGGING_LEVEL_WARNING, "revisely-bench");
  return e;
}

}  // namespace

bool readF32(const std::string& path, size_t count, std::vector<float>& out, std::string& error) {
  std::vector<char> bytes;
  if (!readBytes(path, bytes, error)) return false;
  if (bytes.size() % 4 != 0 || (count > 0 && bytes.size() != count * 4)) {
    error = path + ": " + std::to_string(bytes.size()) + " bytes, expected " + std::to_string(count * 4);
    return false;
  }
  out.resize(bytes.size() / 4);
  std::copy(bytes.begin(), bytes.end(), reinterpret_cast<char*>(out.data()));
  return true;
}

bool readPcm16(const std::string& path, std::vector<float>& out, std::string& error) {
  std::vector<char> bytes;
  if (!readBytes(path, bytes, error)) return false;
  const size_t n = bytes.size() / 2;
  out.resize(n);
  for (size_t i = 0; i < n; i++) {
    const auto lo = static_cast<uint8_t>(bytes[2 * i]);
    const auto hi = static_cast<uint8_t>(bytes[2 * i + 1]);
    const auto s = static_cast<int16_t>(static_cast<uint16_t>(lo | (hi << 8)));
    out[i] = static_cast<float>(s) / 32768.0f;
  }
  return true;
}

// ---------------------------------------------------------------- FFT

Fft::Fft() : twRe_(kFft), twIm_(kFft), re_(kFft), im_(kFft) {
  int n = kFft;
  for (int p : {4, 2, 3, 5}) {
    while (n % p == 0) {
      factors_.push_back(p);
      n /= p;
    }
  }
  for (int p = 7; n > 1; p++) {
    while (n % p == 0) {
      factors_.push_back(p);
      n /= p;
    }
  }
  for (int j = 0; j < kFft; j++) {
    const double a = 2.0 * 3.14159265358979323846 * j / kFft;
    twRe_[j] = std::cos(a);
    twIm_[j] = -std::sin(a);
  }
}

// Decimation in time: the n inputs in[0], in[stride], … become p interleaved sub-transforms of m = n / p points,
// written at out + r·m; then X[k + q·m] = Σ_r W_n^(r·k) · W_p^(r·q) · Y_r[k], in place, one k at a time.
void Fft::step(const double* in, int stride, int n, int out, int factor, int twStride) {
  if (n == 1) {
    re_[out] = in[0];
    im_[out] = 0;
    return;
  }
  const int p = factors_[factor];
  const int m = n / p;
  for (int r = 0; r < p; r++) step(in + r * stride, stride * p, m, out + r * m, factor + 1, twStride * p);
  double tRe[16], tIm[16];
  const int unit = kFft / p;  // W_p = W_N^(N/p)
  for (int k = 0; k < m; k++) {
    for (int r = 0; r < p; r++) {
      const int i = out + r * m + k;
      const int w = (r * k * twStride) % kFft;
      tRe[r] = re_[i] * twRe_[w] - im_[i] * twIm_[w];
      tIm[r] = re_[i] * twIm_[w] + im_[i] * twRe_[w];
    }
    for (int q = 0; q < p; q++) {
      double sRe = 0, sIm = 0;
      for (int r = 0; r < p; r++) {
        const int w = ((r * q) % p) * unit;
        sRe += tRe[r] * twRe_[w] - tIm[r] * twIm_[w];
        sIm += tRe[r] * twIm_[w] + tIm[r] * twRe_[w];
      }
      re_[out + q * m + k] = sRe;
      im_[out + q * m + k] = sIm;
    }
  }
}

void Fft::power(const double* in, double* power) {
  step(in, 1, kFft, 0, 0, 1);
  for (int k = 0; k < kBins; k++) power[k] = re_[k] * re_[k] + im_[k] * im_[k];
}

// ---------------------------------------------------------------- log-mel

LogMel::LogMel(std::vector<float> hann, std::vector<float> filters)
    : hann_(std::move(hann)), filters_(std::move(filters)), from_(kMels, 0), to_(kMels, 0), frame_(kFft), power_(kBins) {
  for (int b = 0; b < kMels; b++) {
    const float* row = filters_.data() + static_cast<size_t>(b) * kBins;
    int lo = kBins, hi = 0;
    for (int k = 0; k < kBins; k++)
      if (row[k] != 0.0f) {
        lo = std::min(lo, k);
        hi = k + 1;
      }
    from_[b] = lo < hi ? lo : 0;
    to_[b] = lo < hi ? hi : 0;
  }
}

int LogMel::compute(const float* window, size_t n, std::vector<float>& out) {
  const size_t yLen = n + 2 * kSilence;
  const size_t len = yLen + 2 * kReflect;
  auto y = [&](size_t j) -> double {
    return j >= static_cast<size_t>(kSilence) && j < kSilence + n ? window[j - kSilence] : 0.0;
  };
  padded_.resize(len);
  for (size_t i = 0; i < len; i++) {
    if (i < static_cast<size_t>(kReflect)) padded_[i] = y(kReflect - i);
    else if (i >= kReflect + yLen) padded_[i] = y(yLen - 2 - (i - kReflect - yLen));
    else padded_[i] = y(i - kReflect);
  }
  const int frames = 1 + static_cast<int>((len - kFft) / kStep);
  logs_.assign(static_cast<size_t>(kMels) * frames, 0.0);
  double top = -1e300;
  for (int f = 0; f < frames; f++) {
    const double* src = padded_.data() + static_cast<size_t>(f) * kStep;
    for (int k = 0; k < kFft; k++) frame_[k] = src[k] * static_cast<double>(hann_[k]);
    fft_.power(frame_.data(), power_.data());
    for (int b = 0; b < kMels; b++) {
      const float* row = filters_.data() + static_cast<size_t>(b) * kBins;
      double v = 0;
      for (int k = from_[b]; k < to_[b]; k++) v += static_cast<double>(row[k]) * power_[k];
      const double l = std::log10(std::max(v, 1e-10));
      logs_[static_cast<size_t>(b) * frames + f] = l;
      top = std::max(top, l);
    }
  }
  // The floor counts every frame, the odd last one too (as numpy computes it before the crop).
  const double floor = top - 8.0;
  const int even = frames - frames % 2;
  out.resize(static_cast<size_t>(kMels) * even);
  for (int b = 0; b < kMels; b++)
    for (int f = 0; f < even; f++)
      out[static_cast<size_t>(b) * even + f] =
          static_cast<float>((std::max(logs_[static_cast<size_t>(b) * frames + f], floor) + 4.0) / 4.0);
  return even;
}

// ---------------------------------------------------------------- the model

namespace {

struct Model {
  std::unique_ptr<Ort::Session> session;
  std::vector<std::string> inputNames, outputNames;
  std::vector<ONNXTensorElementDataType> inputTypes;
};

Model open(const Plan& plan) {
  Ort::SessionOptions so;
  if (plan.threads > 0) so.SetIntraOpNumThreads(plan.threads);
  so.SetInterOpNumThreads(1);
  so.SetGraphOptimizationLevel(GraphOptimizationLevel::ORT_ENABLE_ALL);
  std::unordered_map<std::string, std::string> providerOptions;
  for (const auto& [k, v] : plan.options) {
    if (k.rfind("session.", 0) == 0) so.AddConfigEntry(k.c_str(), v.c_str());
    else providerOptions[k] = v;
  }
  if (plan.provider == "coreml") {
    if (!plan.cacheDir.empty() && !providerOptions.count("ModelCacheDirectory"))
      providerOptions["ModelCacheDirectory"] = plan.cacheDir;
    so.AppendExecutionProvider("CoreML", providerOptions);
  } else if (plan.provider == "xnnpack") {
    so.AppendExecutionProvider("XNNPACK", providerOptions);
  } else if (plan.provider != "cpu") {
    throw std::runtime_error("unknown provider " + plan.provider);
  }
  Model m;
  m.session = std::make_unique<Ort::Session>(env(), plan.model.c_str(), so);
  Ort::AllocatorWithDefaultOptions alloc;
  for (size_t i = 0; i < m.session->GetInputCount(); i++) {
    m.inputNames.emplace_back(m.session->GetInputNameAllocated(i, alloc).get());
    m.inputTypes.push_back(m.session->GetInputTypeInfo(i).GetTensorTypeAndShapeInfo().GetElementType());
  }
  for (size_t i = 0; i < m.session->GetOutputCount(); i++)
    m.outputNames.emplace_back(m.session->GetOutputNameAllocated(i, alloc).get());
  return m;
}

/** Runs the model on [1, 80, frames] features; fills out with its first output as float32. */
void run(Model& m, std::vector<float>& mel, int frames, std::vector<float>& out, std::vector<int64_t>& shape) {
  auto mem = Ort::MemoryInfo::CreateCpu(OrtArenaAllocator, OrtMemTypeDefault);
  const int64_t melShape[3] = {1, kMels, frames};
  const int64_t oneShape[1] = {1};
  int64_t zero = 0;
  std::vector<Ort::Float16_t> half;
  std::vector<Ort::Value> inputs;
  std::vector<const char*> inNames, outNames;
  for (size_t i = 0; i < m.inputNames.size(); i++) {
    inNames.push_back(m.inputNames[i].c_str());
    switch (m.inputTypes[i]) {
      case ONNX_TENSOR_ELEMENT_DATA_TYPE_FLOAT:
        inputs.push_back(Ort::Value::CreateTensor<float>(mem, mel.data(), mel.size(), melShape, 3));
        break;
      case ONNX_TENSOR_ELEMENT_DATA_TYPE_FLOAT16:
        half.clear();
        half.reserve(mel.size());
        for (float v : mel) half.emplace_back(v);
        inputs.push_back(Ort::Value::CreateTensor<Ort::Float16_t>(mem, half.data(), half.size(), melShape, 3));
        break;
      case ONNX_TENSOR_ELEMENT_DATA_TYPE_INT64:  // the server file's riwaya, zeroed as the server does
        inputs.push_back(Ort::Value::CreateTensor<int64_t>(mem, &zero, 1, oneShape, 1));
        break;
      default:
        throw std::runtime_error("unexpected input type for " + m.inputNames[i]);
    }
  }
  outNames.push_back(m.outputNames[0].c_str());
  auto outs = m.session->Run(Ort::RunOptions{nullptr}, inNames.data(), inputs.data(), inputs.size(), outNames.data(), 1);
  auto info = outs[0].GetTensorTypeAndShapeInfo();
  shape = info.GetShape();
  const size_t count = info.GetElementCount();
  out.resize(count);
  if (info.GetElementType() == ONNX_TENSOR_ELEMENT_DATA_TYPE_FLOAT16) {
    const auto* h = outs[0].GetTensorData<Ort::Float16_t>();
    for (size_t i = 0; i < count; i++) out[i] = h[i].ToFloat();
  } else {
    const float* f = outs[0].GetTensorData<float>();
    std::copy(f, f + count, out.begin());
  }
}

void check(const Plan& plan, Model& m, LogMel& logMel, Result& r) {
  std::vector<float> pcm, want, got, theirs, own;
  std::string error;
  if (!readPcm16(plan.checkPcm, pcm, error) || !readF32(plan.checkMel, 0, want, error) ||
      !readF32(plan.checkOut, 0, theirs, error)) {
    r.checkError = error;
    return;
  }
  if (plan.checkS0 < 0 || plan.checkEnd > static_cast<int>(pcm.size()) || plan.checkEnd <= plan.checkS0) {
    r.checkError = "check window outside the take";
    return;
  }
  const int frames = logMel.compute(pcm.data() + plan.checkS0, plan.checkEnd - plan.checkS0, got);
  if (got.size() != want.size()) {
    r.checkError = "features: " + std::to_string(got.size()) + " values, the vector has " + std::to_string(want.size());
    return;
  }
  r.melMaxDiff = 0;
  for (size_t i = 0; i < got.size(); i++)
    r.melMaxDiff = std::max(r.melMaxDiff, std::fabs(static_cast<double>(got[i]) - want[i]));
  std::vector<int64_t> shape;
  std::vector<float> outTheirs, outOwn;
  run(m, want, frames, outTheirs, shape);
  run(m, got, frames, outOwn, shape);
  const int sounds = static_cast<int>(shape.back());
  const int outFrames = static_cast<int>(outTheirs.size()) / sounds;
  if (static_cast<int>(theirs.size()) != outFrames * sounds) {
    r.checkError = "output: " + std::to_string(outTheirs.size()) + " values, the vector has " + std::to_string(theirs.size());
    return;
  }
  compare(outTheirs.data(), theirs.data(), outFrames, sounds, r.outMaxDiff, r.outTopSame);
  compare(outOwn.data(), theirs.data(), outFrames, sounds, r.ownMaxDiff, r.ownTopSame);
  r.checkFrames = outFrames;
  r.checked = true;
}

}  // namespace

Result runPlan(const Plan& plan, const std::function<double()>& memoryMb, const std::function<void(int, int)>& progress) {
  Result r;
  try {
    std::vector<float> hann, filters, audio;
    std::string error;
    if (!readF32(plan.hann, kFft, hann, error) || !readF32(plan.melFilters, static_cast<size_t>(kMels) * kBins, filters, error) ||
        !readPcm16(plan.audio, audio, error)) {
      r.error = error;
      return r;
    }
    if (static_cast<int>(audio.size()) < plan.windowSamples) {
      r.error = "the clip is shorter than one window";
      return r;
    }
    LogMel logMel(std::move(hann), std::move(filters));
    r.memoryBeforeMb = memoryMb();
    double t0 = nowMs();
    Model m = open(plan);
    r.loadMs = nowMs() - t0;
    r.inputs = m.inputNames;
    r.memoryLoadedMb = memoryMb();

    if (!plan.checkPcm.empty()) check(plan, m, logMel, r);

    const int available = (static_cast<int>(audio.size()) - plan.windowSamples) / plan.hopSamples + 1;
    std::vector<float> mel, out;
    const int total = plan.warmup + plan.windows;
    for (int i = 0; i < total; i++) {
      const size_t start = static_cast<size_t>(i % available) * plan.hopSamples;
      t0 = nowMs();
      const int frames = logMel.compute(audio.data() + start, plan.windowSamples, mel);
      const double t1 = nowMs();
      run(m, mel, frames, out, r.outShape);
      const double t2 = nowMs();
      if (i == 0) r.firstRunMs = t2 - t1;
      if (i >= plan.warmup) {
        r.featureMs.push_back(t1 - t0);
        r.runMs.push_back(t2 - t1);
        if (progress) progress(i - plan.warmup + 1, plan.windows);
      }
    }
    r.memoryAfterMb = memoryMb();
    // Opened again: Core ML's second open reads the compiled model from its cache.
    m.session.reset();
    t0 = nowMs();
    Model again = open(plan);
    r.reloadMs = nowMs() - t0;
    r.ok = true;
  } catch (const Ort::Exception& e) {
    r.error = std::string("onnxruntime: ") + e.what();
  } catch (const std::exception& e) {
    r.error = e.what();
  }
  return r;
}

}  // namespace rec
