package app.revisely.reciteengine

import android.app.ActivityManager
import android.os.BatteryManager
import android.content.Context
import android.os.Build
import android.os.Debug
import android.os.PowerManager
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.typedarray.Int16Array
import java.io.File
import java.io.FileInputStream
import java.security.MessageDigest
import kotlin.concurrent.thread

/**
 * Recite on the phone (Revisely Dev only until the native release). For now the on-device bench:
 * Settings → Testing → On-device model (src/screens/main/OnDeviceBenchScreen.tsx, BEHAVIOUR.md ONDEV-1).
 */
class ReciteEngineModule : Module() {
  private val context: Context?
    get() = appContext.reactContext

  private val engine by lazy {
    EngineHost { take, frames, code ->
      sendEvent("onEngineFrames", mapOf("take" to take, "frames" to frames, "code" to code))
    }
  }

  override fun definition() = ModuleDefinition {
    Name("ReciteEngine")

    Events("onBenchProgress", "onEngineFrames")

    // What the bench reports the phone as: maker, model, chip, cores (and each one's top speed), memory and heat.
    Function("deviceInfo") {
      val memory = ActivityManager.MemoryInfo()
      (context?.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager)?.getMemoryInfo(memory)
      mapOf(
        "platform" to "android",
        "model" to "${Build.MANUFACTURER} ${Build.MODEL}",
        "soc" to if (Build.VERSION.SDK_INT >= 31) "${Build.SOC_MANUFACTURER} ${Build.SOC_MODEL}" else Build.HARDWARE,
        "os" to "Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})",
        "abi" to (Build.SUPPORTED_ABIS.firstOrNull() ?: ""),
        "cores" to Runtime.getRuntime().availableProcessors(),
        "coreMaxMHz" to coreMaxMHz(),
        "memoryMb" to memory.totalMem / 1048576.0,
        "thermal" to thermal(),
      )
    }

    // Which engine this build linked: recite-core or its stub (core/fetch.js), as JSON.
    Function("coreInfo") { ReciteCoreNative.infoJson() }

    // The engine (recite_core.h) on its own thread: EngineHost. A take's frames come back as onEngineFrames.

    // Opens the engine from named files ({name, path}), read into memory. Resolves {ok, code, error, info}.
    AsyncFunction("engineOpenFiles") { items: List<Map<String, String>>, options: String, promise: Promise ->
      val plain = items.map { item -> item["path"]?.let { item + ("path" to plainPath(it)) } ?: item }
      engine.open(plain, options) { promise.resolve(it) }
    }

    // rc_info's JSON while the engine is open.
    Function("engineInfo") { engine.info }

    // Starts a take from the contract's start frame. Resolves {take} or {code, error}.
    AsyncFunction("engineStart") { frame: String, promise: Promise ->
      engine.start(frame) { promise.resolve(it) }
    }

    // The bytes are copied here: the array is JavaScript's, and the engine's thread reads them later.
    Function("engineFeed") { take: Int, pcm: Int16Array ->
      val bytes = ByteArray(pcm.byteLength)
      pcm.read(bytes, 0, bytes.size)
      engine.feed(take, bytes)
      Unit
    }

    Function("engineControl") { take: Int, frame: String ->
      engine.control(take, frame)
      Unit
    }

    Function("engineFinish") { take: Int ->
      engine.finish(take)
      Unit
    }

    Function("engineClose") { take: Int ->
      engine.close(take)
      Unit
    }

    AsyncFunction("engineRelease") { promise: Promise ->
      engine.release { promise.resolve(null) }
    }

    // A file's SHA-256 (hex), read in 1 MB pieces.
    AsyncFunction("sha256") { path: String, promise: Promise ->
      thread(name = "recite-sha256") {
        try {
          val digest = MessageDigest.getInstance("SHA-256")
          FileInputStream(plainPath(path)).use { input ->
            val buf = ByteArray(1 shl 20)
            while (true) {
              val n = input.read(buf)
              if (n <= 0) break
              digest.update(buf, 0, n)
            }
          }
          promise.resolve(digest.digest().joinToString("") { "%02x".format(it) })
        } catch (e: Exception) {
          promise.reject("ERR_READ", "Can't read $path", e)
        }
      }
    }

    // Runs one bench plan on its own thread; progress goes out as onBenchProgress.
    AsyncFunction("bench") { options: Map<String, Any?>, promise: Promise ->
      val plan = Bench.Plan().apply {
        model = plainPath(options["model"] as? String ?: "")
        provider = options["provider"] as? String ?: "cpu"
        threads = (options["threads"] as? Number)?.toInt() ?: 0
        (options["options"] as? Map<*, *>)?.forEach { (k, v) -> if (k is String && v is String) this.options[k] = v }
        melFilters = plainPath(options["melFilters"] as? String ?: "")
        hann = plainPath(options["hann"] as? String ?: "")
        audio = plainPath(options["audio"] as? String ?: "")
        windows = (options["windows"] as? Number)?.toInt() ?: 60
        warmup = (options["warmup"] as? Number)?.toInt() ?: 2
        fromMemory = options["fromMemory"] as? Boolean ?: false
        durationSec = (options["durationSec"] as? Number)?.toInt() ?: 0
        cadenceMs = (options["cadenceMs"] as? Number)?.toInt() ?: 0
        alsoModel = (options["alsoModel"] as? String)?.let { plainPath(it) }
        (options["check"] as? Map<*, *>)?.let { c ->
          checkPcm = plainPath(c["pcm"] as? String ?: "")
          checkMel = plainPath(c["mel"] as? String ?: "")
          checkOut = plainPath(c["out"] as? String ?: "")
          checkS0 = (c["s0"] as? Number)?.toInt() ?: 0
          checkEnd = (c["end"] as? Number)?.toInt() ?: 0
        }
      }
      thread(name = "recite-bench") {
        val thermalBefore = thermal()
        // Battery and heat once a minute (research's 20-minute protocol).
        val samples = mutableListOf<Map<String, Any>>()
        val r = Bench.run(
          plan,
          { memoryMb() },
          { done, total -> sendEvent("onBenchProgress", mapOf("done" to done, "total" to total)) },
          { elapsed -> samples.add(sample(elapsed)) },
        )
        promise.resolve(
          mapOf(
            "ok" to r.ok,
            "error" to r.error,
            "loadMs" to r.loadMs,
            "firstRunMs" to r.firstRunMs,
            "reloadMs" to r.reloadMs,
            "featureMs" to r.featureMs,
            "runMs" to r.runMs,
            "startMs" to r.startMs,
            "late" to r.late,
            "samples" to samples,
            "inputs" to r.inputs,
            "outShape" to r.outShape.map { it.toDouble() },
            "memoryBeforeMb" to r.memoryBeforeMb,
            "memoryLoadedMb" to r.memoryLoadedMb,
            "memoryAfterMb" to r.memoryAfterMb,
            "alsoLoadMs" to r.alsoLoadMs,
            "memoryBothMb" to r.memoryBothMb,
            "check" to if (r.checked) {
              mapOf(
                "frames" to r.checkFrames,
                "melMaxDiff" to r.melMaxDiff,
                "outMaxDiff" to r.outMaxDiff,
                "outTopSame" to r.outTopSame,
                "ownMaxDiff" to r.ownMaxDiff,
                "ownTopSame" to r.ownTopSame,
              )
            } else {
              null
            },
            "checkError" to r.checkError,
            "thermalBefore" to thermalBefore,
            "thermalAfter" to thermal(),
          ),
        )
      }
    }

    // ---- The pack (BEHAVIOUR.md ONDEV-2, ONDEV-3). JS only ever holds the wrapped key; the key itself stays in here.

    // This phone's public key, made on first use: the private half never leaves the Keystore.
    AsyncFunction("packPublicKey") { promise: Promise ->
      thread(name = "recite-pack") {
        try {
          promise.resolve(mapOf("publicKey" to RecitePackKey.publicKeyBase64(), "keyFormat" to "spki"))
        } catch (e: Exception) {
          promise.reject("ERR_PACK_KEY", e.message ?: "no device key", e)
        }
      }
    }

    // Keeps the pack's wrapped key beside its parts.
    AsyncFunction("packSaveKey") { dir: String, wrappedKey: String, promise: Promise ->
      thread(name = "recite-pack") {
        try {
          RecitePackStore.saveKey(plainPath(dir), wrappedKey)
          promise.resolve(null)
        } catch (e: Exception) {
          promise.reject("ERR_PACK_KEY", e.message ?: "can't keep the key", e)
        }
      }
    }

    // Decrypts a downloaded part and checks everything in it, keeping none of it.
    AsyncFunction("packVerify") { dir: String, packId: String, part: String, promise: Promise ->
      thread(name = "recite-pack") {
        try {
          RecitePackStore.verify(plainPath(dir), packId, part)
          promise.resolve(mapOf("ok" to true))
        } catch (e: Exception) {
          promise.resolve(mapOf("ok" to false, "error" to (e.message ?: e.toString())))
        }
      }
    }
  }

  /** The battery (percent, charging, the current drawn in mA where the phone reports it), heat and memory now. */
  private fun sample(elapsedMs: Double): Map<String, Any> {
    val bm = context?.getSystemService(Context.BATTERY_SERVICE) as? BatteryManager
    val percent = bm?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1
    val currentUa = bm?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CURRENT_NOW) ?: Int.MIN_VALUE
    return mapOf(
      "t" to elapsedMs,
      "battery" to percent.toDouble(),
      "charging" to (if (Build.VERSION.SDK_INT >= 23) bm?.isCharging ?: false else false),
      "currentMa" to (if (currentUa == Int.MIN_VALUE || currentUa == 0) -1.0 else currentUa / 1000.0),
      "thermal" to thermal(),
      "memoryMb" to memoryMb(),
    )
  }

  /** The process's proportional set size in MB (its share of the memory it touches). */
  private fun memoryMb(): Double = Debug.getPss() / 1024.0

  private fun thermal(): String {
    if (Build.VERSION.SDK_INT < 29) return "unknown"
    val pm = context?.getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return "unknown"
    return when (pm.currentThermalStatus) {
      PowerManager.THERMAL_STATUS_NONE -> "none"
      PowerManager.THERMAL_STATUS_LIGHT -> "light"
      PowerManager.THERMAL_STATUS_MODERATE -> "moderate"
      PowerManager.THERMAL_STATUS_SEVERE -> "severe"
      PowerManager.THERMAL_STATUS_CRITICAL -> "critical"
      PowerManager.THERMAL_STATUS_EMERGENCY -> "emergency"
      PowerManager.THERMAL_STATUS_SHUTDOWN -> "shutdown"
      else -> "unknown"
    }
  }

  /** Each core's top speed (big and little cores differ), from sysfs; empty where it can't be read. */
  private fun coreMaxMHz(): List<Int> =
    (0 until Runtime.getRuntime().availableProcessors()).mapNotNull { i ->
      try {
        File("/sys/devices/system/cpu/cpu$i/cpufreq/cpuinfo_max_freq").readText().trim().toInt() / 1000
      } catch (e: Exception) {
        null
      }
    }

  /** file:// URIs from expo-file-system to plain paths. */
  private fun plainPath(path: String): String = if (path.startsWith("file://")) android.net.Uri.parse(path).path ?: path else path
}
