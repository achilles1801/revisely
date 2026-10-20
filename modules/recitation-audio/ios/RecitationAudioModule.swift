import AVFoundation
import ExpoModulesCore

// The microphone as 16 kHz mono 16-bit PCM, for speech recognition on the device.
//
// The audio session is set up by JavaScript (src/lib/audioFocus.ts, through
// expo-audio) before start(), exactly as for recording, so the app keeps one
// owner of the session. This only taps the input: AVAudioEngine delivers the
// hardware format, AVAudioConverter turns it into 16 kHz mono Int16, and each
// buffer goes to JavaScript as base64 with its loudness.
//
// Nothing is written to disk. A call, Siri or an alarm (an interruption), or a
// change of route that stops the engine (headphones), ends the capture with an
// onStop event saying why; JavaScript decides whether to start again.

public class RecitationAudioModule: Module {
  private var engine: AVAudioEngine?
  private var converter: AVAudioConverter?
  private let outputFormat = AVAudioFormat(
    commonFormat: .pcmFormatInt16, sampleRate: 16000, channels: 1, interleaved: true)!
  private var observers: [NSObjectProtocol] = []
  private let queue = DispatchQueue(label: "app.revisely.recitation-audio")

  public func definition() -> ModuleDefinition {
    Name("RecitationAudio")

    Events("onAudio", "onStop")

    AsyncFunction("start") { (promise: Promise) in
      self.queue.async {
        do {
          try self.startCapture()
          promise.resolve(nil)
        } catch {
          self.teardown()
          promise.reject("ERR_RECITATION_AUDIO_START", error.localizedDescription)
        }
      }
    }

    AsyncFunction("stop") { (promise: Promise) in
      self.queue.async {
        self.teardown()
        promise.resolve(nil)
      }
    }

    Function("isCapturing") { () -> Bool in
      return self.engine?.isRunning ?? false
    }

    // Large files that can be downloaded again (the speech model) stay out of
    // iCloud backups, as Apple's storage guidelines ask.
    Function("excludeFromBackup") { (path: String) in
      var url = URL(fileURLWithPath: path)
      var values = URLResourceValues()
      values.isExcludedFromBackup = true
      try url.setResourceValues(values)
    }

    OnDestroy {
      self.queue.sync { self.teardown() }
    }
  }

  private func startCapture() throws {
    teardown()
    let engine = AVAudioEngine()
    let input = engine.inputNode
    let inputFormat = input.outputFormat(forBus: 0)
    guard inputFormat.sampleRate > 0, inputFormat.channelCount > 0 else {
      throw NSError(
        domain: "RecitationAudio", code: 1,
        userInfo: [NSLocalizedDescriptionKey: "No microphone input is available."])
    }
    guard let converter = AVAudioConverter(from: inputFormat, to: outputFormat) else {
      throw NSError(
        domain: "RecitationAudio", code: 2,
        userInfo: [NSLocalizedDescriptionKey: "Unsupported microphone format \(inputFormat)."])
    }
    converter.downmix = true
    self.converter = converter

    // About a tenth of a second per buffer at the hardware rate.
    let bufferSize = AVAudioFrameCount(max(1024, inputFormat.sampleRate / 10))
    input.installTap(onBus: 0, bufferSize: bufferSize, format: inputFormat) { [weak self] buffer, _ in
      self?.deliver(buffer)
    }
    engine.prepare()
    try engine.start()
    self.engine = engine
    observe()
  }

  private func deliver(_ buffer: AVAudioPCMBuffer) {
    guard let converter = converter else { return }
    let ratio = outputFormat.sampleRate / buffer.format.sampleRate
    let capacity = AVAudioFrameCount(Double(buffer.frameLength) * ratio) + 32
    guard let out = AVAudioPCMBuffer(pcmFormat: outputFormat, frameCapacity: capacity) else { return }
    var consumed = false
    var error: NSError?
    let status = converter.convert(to: out, error: &error) { _, inputStatus in
      if consumed {
        inputStatus.pointee = .noDataNow
        return nil
      }
      consumed = true
      inputStatus.pointee = .haveData
      return buffer
    }
    guard status != .error, out.frameLength > 0, let samples = out.int16ChannelData?[0] else { return }
    let count = Int(out.frameLength)
    var sum: Double = 0
    for i in 0..<count {
      let s = Double(samples[i])
      sum += s * s
    }
    let rms = sqrt(sum / Double(count)) / 32768
    let level = rms > 0 ? max(-100, 20 * log10(rms)) : -100
    let data = Data(bytes: samples, count: count * MemoryLayout<Int16>.size)
    sendEvent("onAudio", ["data": data.base64EncodedString(), "level": level])
  }

  private func observe() {
    let center = NotificationCenter.default
    observers.append(
      center.addObserver(
        forName: AVAudioSession.interruptionNotification, object: nil, queue: nil
      ) { [weak self] note in
        guard
          let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
          AVAudioSession.InterruptionType(rawValue: raw) == .began
        else { return }
        self?.stopFor("interrupted")
      })
    if let engine = engine {
      observers.append(
        center.addObserver(
          forName: .AVAudioEngineConfigurationChange, object: engine, queue: nil
        ) { [weak self] _ in
          // The engine has stopped itself (new route or format).
          self?.stopFor("route")
        })
    }
  }

  private func stopFor(_ reason: String) {
    queue.async {
      guard self.engine != nil else { return }
      self.teardown()
      self.sendEvent("onStop", ["reason": reason])
    }
  }

  private func teardown() {
    observers.forEach { NotificationCenter.default.removeObserver($0) }
    observers.removeAll()
    if let engine = engine {
      engine.inputNode.removeTap(onBus: 0)
      engine.stop()
    }
    engine = nil
    converter = nil
  }
}
