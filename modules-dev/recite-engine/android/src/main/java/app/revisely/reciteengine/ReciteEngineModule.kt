package app.revisely.reciteengine

import android.app.ActivityManager
import android.content.Context
import android.os.Build
import android.os.Debug
import android.os.PowerManager
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
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

  override fun definition() = ModuleDefinition {
    Name("ReciteEngine")

    Events("onBenchProgress")

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
        val r = Bench.run(plan, { memoryMb() }) { done, total ->
          sendEvent("onBenchProgress", mapOf("done" to done, "total" to total))
        }
        promise.resolve(
          mapOf(
            "ok" to r.ok,
            "error" to r.error,
            "loadMs" to r.loadMs,
            "firstRunMs" to r.firstRunMs,
            "reloadMs" to r.reloadMs,
            "featureMs" to r.featureMs,
            "runMs" to r.runMs,
            "inputs" to r.inputs,
            "outShape" to r.outShape.map { it.toDouble() },
            "memoryBeforeMb" to r.memoryBeforeMb,
            "memoryLoadedMb" to r.memoryLoadedMb,
            "memoryAfterMb" to r.memoryAfterMb,
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
