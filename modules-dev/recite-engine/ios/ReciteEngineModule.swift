import CryptoKit
import ExpoModulesCore
import Foundation
import UIKit

/// Recite on the phone (Revisely Dev only until the native release). For now the on-device bench:
/// Settings → Testing → On-device model (src/screens/main/OnDeviceBenchScreen.tsx, BEHAVIOUR.md ONDEV-1).
public class ReciteEngineModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ReciteEngine")

    Events("onBenchProgress", "onEngineFrames")

    OnCreate {
      RECEngine.shared.onFrames = { [weak self] take, frames, code in
        self?.sendEvent("onEngineFrames", ["take": take, "frames": frames, "code": code])
      }
    }

    OnDestroy {
      RECEngine.shared.onFrames = nil
    }

    /// What the bench reports the phone as: its model identifier (e.g. iPhone16,2), cores, memory and heat.
    Function("deviceInfo") { () -> [String: Any] in
      var system = utsname()
      uname(&system)
      let machine = withUnsafeBytes(of: &system.machine) { raw in
        String(decoding: raw.prefix { $0 != 0 }, as: UTF8.self)
      }
      let info = ProcessInfo.processInfo
      return [
        "platform": "ios",
        "model": machine,
        "os": UIDevice.current.systemVersion,
        "cores": info.processorCount,
        "activeCores": info.activeProcessorCount,
        "memoryMb": Double(info.physicalMemory) / 1_048_576,
        "thermal": ReciteEngineModule.thermal(),
        "lowPower": info.isLowPowerModeEnabled,
      ]
    }

    /// Which engine this build linked: recite-core or its stub (core/fetch.js), as JSON.
    Function("coreInfo") { () -> String in RECCore.infoJSON() }

    /// The highest the app's memory has been since it started, in MB (what iOS counts against it).
    Function("memoryPeakMb") { () -> Double in RECBench.peakFootprintMb() }

    /// The app's memory now, in MB (the footprint iOS counts against it).
    Function("memoryNowMb") { () -> Double in RECBench.footprintMb() }

    // The engine (recite_core.h) on its own thread: RECEngine. A take's frames come back as onEngineFrames.

    /// Opens the engine from named files ({name, path}), read into memory. Resolves {ok, code, error, info}.
    AsyncFunction("engineOpenFiles") { (items: [[String: String]], options: String, promise: Promise) in
      let plain = items.map { item -> [String: String] in
        var out = item
        if let path = item["path"] { out["path"] = ReciteEngineModule.plainPath(path) }
        return out
      }
      RECEngine.shared.openFiles(plain, options: options) { promise.resolve($0) }
    }

    /// Opens the engine from Recite's pack: decrypted and checked here (the key stays in native memory), then read in
    /// place by the engine, which holds the blobs until rc_release; they are wiped and freed then. Resolves {ok, code,
    /// error, info}; code -20 means its files failed the reader's checks here, before `rc_open` (a damaged file, a lost key).
    AsyncFunction("enginePackOpen") { (dir: String, packId: String, parts: [String], options: String, promise: Promise) in
      let path = ReciteEngineModule.plainPath(dir)
      DispatchQueue.global(qos: .userInitiated).async {
        do {
          let blobs = try RecitePackStore.open(dir: path, packId: packId, parts: parts)
          let items = blobs.map { RECEngineBlob(name: $0.name, bytes: $0.data, size: UInt($0.room)) }
          // Swift's name for openBlobs:owner:options:done:
          RECEngine.shared.open(items, owner: blobs, options: options) { promise.resolve($0) }
        } catch {
          let text = "\(error)"
          promise.resolve(["ok": false, "code": text.hasPrefix("no memory") ? -3 : -20, "error": text])
        }
      }
    }

    /// rc_info's JSON while the engine is open.
    Function("engineInfo") { () -> String? in RECEngine.shared.info }

    /// Starts a take from the contract's start frame. Resolves {take} or {code, error}.
    AsyncFunction("engineStart") { (frame: String, hop: Double, promise: Promise) in
      RECEngine.shared.startTake(frame, hop: hop) { promise.resolve($0) }
    }

    /// The bytes are copied here: the array is JavaScript's, and the engine's thread reads them later.
    Function("engineFeed") { (take: Int, pcm: Int16Array) in
      RECEngine.shared.feedTake(take, pcm: Data(bytes: pcm.rawPointer, count: pcm.byteLength))
    }

    Function("engineControl") { (take: Int, frame: String) in RECEngine.shared.controlTake(take, frame: frame) }

    Function("engineFinish") { (take: Int) in RECEngine.shared.finishTake(take) }

    Function("engineClose") { (take: Int) in RECEngine.shared.closeTake(take) }

    /// Samples [s0, s1) of an open take as base64, for the teacher's clips; null if they aren't there.
    AsyncFunction("engineClip") { (take: Int, s0: Double, s1: Double, promise: Promise) in
      guard let from = Int64(exactly: s0), let to = Int64(exactly: s1) else {
        promise.resolve(nil)
        return
      }
      RECEngine.shared.clipTake(take, from: from, to: to) { promise.resolve($0) }
    }

    /// One model call on the pack's check input, timed: its ms, or null when it can't run.
    AsyncFunction("engineProbe") { (promise: Promise) in
      RECEngine.shared.probe { ms in promise.resolve(ms >= 0 ? ms : nil) }
    }

    AsyncFunction("engineRelease") { (promise: Promise) in
      RECEngine.shared.releaseEngine { promise.resolve(nil) }
    }

    /// A file's SHA-256 (hex), read in 1 MB pieces.
    AsyncFunction("sha256") { (path: String, promise: Promise) in
      DispatchQueue.global(qos: .utility).async {
        guard let handle = FileHandle(forReadingAtPath: ReciteEngineModule.plainPath(path)) else {
          promise.reject("ERR_READ", "Can't open \(path)")
          return
        }
        defer { try? handle.close() }
        var hasher = SHA256()
        while true {
          let chunk = handle.readData(ofLength: 1 << 20)
          if chunk.isEmpty { break }
          hasher.update(data: chunk)
        }
        promise.resolve(hasher.finalize().map { String(format: "%02x", $0) }.joined())
      }
    }

    /// Runs one bench plan on its own thread; progress goes out as onBenchProgress.
    AsyncFunction("bench") { (options: [String: Any], promise: Promise) in
      var plan = options
      for key in ["model", "alsoModel", "melFilters", "hann", "audio", "cacheDir"] {
        if let value = plan[key] as? String { plan[key] = ReciteEngineModule.plainPath(value) }
      }
      if var check = plan["check"] as? [String: Any] {
        for key in ["pcm", "mel", "out"] {
          if let value = check[key] as? String { check[key] = ReciteEngineModule.plainPath(value) }
        }
        plan["check"] = check
      }
      DispatchQueue.global(qos: .userInitiated).async { [weak self] in
        let thermalBefore = ReciteEngineModule.thermal()
        var result = RECBench.run(plan) { done, total in
          self?.sendEvent("onBenchProgress", ["done": done, "total": total])
        }
        result["thermalBefore"] = thermalBefore
        result["thermalAfter"] = ReciteEngineModule.thermal()
        promise.resolve(result)
      }
    }

    // ---- The pack (BEHAVIOUR.md ONDEV-2, ONDEV-3). JS only ever holds the wrapped key; the key itself stays in here.

    /// This phone's public key, made on first use: the private half never leaves the Keychain.
    AsyncFunction("packPublicKey") { (promise: Promise) in
      DispatchQueue.global(qos: .utility).async {
        do {
          promise.resolve(["publicKey": try RecitePackKey.publicKeyBase64(), "keyFormat": "pkcs1"])
        } catch {
          promise.reject("ERR_PACK_KEY", "\(error)")
        }
      }
    }

    /// Keeps the pack's wrapped key beside its parts.
    AsyncFunction("packSaveKey") { (dir: String, wrappedKey: String, promise: Promise) in
      DispatchQueue.global(qos: .utility).async {
        do {
          try RecitePackStore.saveKey(dir: ReciteEngineModule.plainPath(dir), wrappedBase64: wrappedKey)
          promise.resolve(nil)
        } catch {
          promise.reject("ERR_PACK_KEY", "\(error)")
        }
      }
    }

    /// Decrypts a downloaded part and checks everything in it, keeping none of it.
    AsyncFunction("packVerify") { (dir: String, packId: String, part: String, promise: Promise) in
      DispatchQueue.global(qos: .utility).async {
        do {
          try RecitePackStore.verify(dir: ReciteEngineModule.plainPath(dir), packId: packId, part: part)
          promise.resolve(["ok": true])
        } catch {
          promise.resolve(["ok": false, "error": "\(error)"])
        }
      }
    }
  }

  /// file:// URIs from expo-file-system to plain paths.
  static func plainPath(_ path: String) -> String {
    if path.hasPrefix("file://"), let url = URL(string: path) { return url.path }
    return path
  }

  /// nominal, fair, serious or critical.
  static func thermal() -> String {
    switch ProcessInfo.processInfo.thermalState {
    case .nominal: return "nominal"
    case .fair: return "fair"
    case .serious: return "serious"
    case .critical: return "critical"
    @unknown default: return "unknown"
    }
  }
}
