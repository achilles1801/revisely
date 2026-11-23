import CryptoKit
import ExpoModulesCore
import Foundation
import UIKit

/// Recite on the phone (Revisely Dev only until the native release). For now the on-device bench:
/// Settings → Testing → On-device model (src/screens/main/OnDeviceBenchScreen.tsx, BEHAVIOUR.md ONDEV-1).
public class ReciteEngineModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ReciteEngine")

    Events("onBenchProgress")

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
