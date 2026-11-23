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
import android.net.Uri
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.nio.ByteBuffer
import java.util.zip.ZipFile
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
    }.also { it.thermal = ::thermalNumber }
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
        "lowPower" to ((context?.getSystemService(Context.POWER_SERVICE) as? PowerManager)?.isPowerSaveMode == true),
      )
    }

    // Which engine this build linked: recite-core or its stub (core/fetch.js), as JSON.
    Function("coreInfo") { ReciteCoreNative.infoJson() }

    // The highest the app's resident memory has been since it started, in MB (VmHWM); 0 where it can't be read.
    Function("memoryPeakMb") { peakMemoryMb() }

    // The engine (recite_core.h) on its own thread: EngineHost. A take's frames come back as onEngineFrames.

    // Opens the engine from named files ({name, path}), read into memory. Resolves {ok, code, error, info}.
    AsyncFunction("engineOpenFiles") { items: List<Map<String, String>>, options: String, promise: Promise ->
      val plain = items.map { item -> item["path"]?.let { item + ("path" to plainPath(it)) } ?: item }
      engine.open(plain, options) { promise.resolve(it) }
    }

    // Opens the engine from Recite's pack: decrypted and checked here (the key stays in native memory), then read in
    // place by the engine, which holds the blobs until rc_release; they are wiped and freed then. Resolves {ok, code,
    // error, info}; code -20 means its files failed the reader's checks here, before rc_open (a damaged file, a lost key).
    AsyncFunction("enginePackOpen") { dir: String, packId: String, parts: List<String>, options: String, promise: Promise ->
      thread(name = "recite-pack") {
        if (!ReciteCoreNative.available) {
          promise.resolve(mapOf("ok" to false, "code" to -3, "error" to "the native library didn't load"))
          return@thread
        }
        val memory = ArrayList<ByteBuffer>()
        val blobs = try {
          RecitePackStore.open(plainPath(dir), packId, parts) { _, room ->
            ReciteCoreNative.allocBlob(room)?.also { memory.add(it) }
          }
        } catch (e: Exception) {
          memory.forEach { ReciteCoreNative.freeBlob(it) }
          val text = e.message ?: "the pack didn't open"
          promise.resolve(mapOf("ok" to false, "code" to if (text.startsWith("no memory")) -3 else -20, "error" to text))
          return@thread
        }
        engine.openBlobs(blobs.map { it.name }, blobs.map { it.data }, options, {
          blobs.forEach { it.wipe() }
          memory.forEach { ReciteCoreNative.freeBlob(it) }
        }) { promise.resolve(it) }
      }
    }

    // Test Lab's self-check: the engine from plain, watermarked blobs in the OBB (no account there, so no pack key). Each
    // goes in a direct buffer of its `room`, as a pack's do, since the engine widens the weights in place.
    AsyncFunction("engineOpenRooms") { items: List<Map<String, Any>>, options: String, promise: Promise ->
      thread(name = "recite-rooms") {
        if (!ReciteCoreNative.available) {
          promise.resolve(mapOf("ok" to false, "code" to -3, "error" to "the native library didn't load"))
          return@thread
        }
        val names = ArrayList<String>(items.size)
        val memory = ArrayList<ByteBuffer>(items.size)
        try {
          for (item in items) {
            val name = item["name"] as String
            val file = File(plainPath(item["path"] as String))
            val size = file.length()
            val room = (item["room"] as Number).toLong()
            if (room < size || room > Int.MAX_VALUE) throw IllegalArgumentException("$name: room")
            val buffer = ReciteCoreNative.allocBlob(room.toInt()) ?: throw IllegalStateException("no memory for $name")
            memory.add(buffer)
            names.add(name)
            buffer.limit(size.toInt())
            FileInputStream(file).channel.use { channel ->
              while (buffer.hasRemaining()) {
                if (channel.read(buffer) < 0) throw IllegalStateException("$name: cut short")
              }
            }
            buffer.clear()
          }
        } catch (e: Exception) {
          memory.forEach { ReciteCoreNative.freeBlob(it) }
          val text = e.message ?: "the files didn't open"
          promise.resolve(mapOf("ok" to false, "code" to if (text.startsWith("no memory")) -3 else -2, "error" to text))
          return@thread
        }
        engine.openBlobs(names, memory, options, { memory.forEach { ReciteCoreNative.freeBlob(it) } }) { promise.resolve(it) }
      }
    }

    // rc_info's JSON while the engine is open.
    Function("engineInfo") { engine.info }

    // Starts a take from the contract's start frame. Resolves {take} or {code, error}.
    AsyncFunction("engineStart") { frame: String, hop: Double, promise: Promise ->
      engine.start(frame, hop) { promise.resolve(it) }
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

    // Samples [s0, s1) of an open take as base64, for the teacher's clips; null if they aren't there.
    AsyncFunction("engineClip") { take: Int, s0: Double, s1: Double, promise: Promise ->
      engine.clip(take, s0.toLong(), s1.toLong()) { promise.resolve(it) }
    }

    // One model call on the pack's check input, timed: its ms, or null when it can't run.
    AsyncFunction("engineProbe") { promise: Promise ->
      engine.probe { promise.resolve(it) }
    }

    AsyncFunction("engineRelease") { promise: Promise ->
      engine.release { promise.resolve(null) }
    }

    // Firebase Test Lab's game loop (no sign-in on its phones): the launch intent's action, scenario and results file.
    Function("testLoop") {
      val intent = appContext.currentActivity?.intent ?: return@Function null
      if (intent.action != "com.google.intent.action.TEST_LOOP") return@Function null
      mapOf("scenario" to intent.getIntExtra("scenario", 0), "results" to intent.data?.toString())
    }

    // The bench's files, pushed by Test Lab as the app's OBB (a zip), unpacked once into the cache; resolves to the folder.
    AsyncFunction("unpackObb") { promise: Promise ->
      thread(name = "recite-obb") {
        try {
          val ctx = context ?: throw IllegalStateException("no context")
          val obb = ctx.obbDir?.listFiles()?.firstOrNull { it.name.endsWith(".obb") }
            ?: throw IllegalStateException("no OBB in ${ctx.obbDir}")
          val out = File(ctx.cacheDir, "recite-bench-obb")
          val mark = File(out, ".from")
          val stamp = "${obb.name}:${obb.length()}:${obb.lastModified()}"
          if (!(mark.exists() && mark.readText() == stamp)) {
            out.deleteRecursively()
            out.mkdirs()
            ZipFile(obb).use { zip ->
              for (entry in zip.entries()) {
                val target = File(out, entry.name)
                if (!target.canonicalPath.startsWith(out.canonicalPath + File.separator)) continue
                if (entry.isDirectory) {
                  target.mkdirs()
                  continue
                }
                target.parentFile?.mkdirs()
                zip.getInputStream(entry).use { input -> FileOutputStream(target).use { input.copyTo(it, 1 shl 20) } }
              }
            }
            mark.writeText(stamp)
          }
          promise.resolve(out.absolutePath)
        } catch (e: Exception) {
          promise.reject("ERR_OBB", e.message ?: "unpack failed", e)
        }
      }
    }

    // Writes (replaces) the game loop's results file, given by Test Lab as a content URI.
    AsyncFunction("writeTestLoopResult") { uri: String, text: String, promise: Promise ->
      thread(name = "recite-loop-result") {
        try {
          val resolver = context?.contentResolver ?: throw IllegalStateException("no context")
          resolver.openFileDescriptor(Uri.parse(uri), "wt")?.use { fd ->
            FileOutputStream(fd.fileDescriptor).use { it.write(text.toByteArray(Charsets.UTF_8)) }
          } ?: throw IllegalStateException("can't open $uri")
          promise.resolve(null)
        } catch (e: Exception) {
          promise.reject("ERR_LOOP_RESULT", e.message ?: "write failed", e)
        }
      }
    }

    // Ends the game loop: Test Lab takes the app closing as the test finishing.
    Function("finishTestLoop") {
      appContext.currentActivity?.let { activity -> activity.runOnUiThread { activity.finishAndRemoveTask() } }
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

  private fun peakMemoryMb(): Double = try {
    File("/proc/self/status").useLines { lines -> lines.firstOrNull { it.startsWith("VmHWM:") } }
      ?.trim()?.split(Regex("\\s+"))?.getOrNull(1)?.toDoubleOrNull()?.div(1024.0) ?: 0.0
  } catch (e: Exception) {
    0.0
  }

  /** The thermal status as a number for a take's health line; -1 before Android 10. */
  private fun thermalNumber(): Int {
    if (Build.VERSION.SDK_INT < 29) return -1
    val pm = context?.getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return -1
    return pm.currentThermalStatus
  }

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
