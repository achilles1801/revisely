package app.revisely.reciteengine

import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.Executors

/**
 * recite_core.h on one background thread: every call on the engine and its takes runs there, in the order made, so
 * audio, controls and the end reach a take as the app sent them and the JavaScript thread never waits on a hop.
 * [emit] gets a take's frames in order; code is 0, or the RC_ERR_* of the call that failed.
 */
internal class EngineHost(private val emit: (take: Int, frames: List<String>, code: Int) -> Unit) {
  private val queue = Executors.newSingleThreadExecutor { r -> Thread(r, "recite-engine") }
  private var engine = 0L
  private val takes = HashMap<Int, Long>()
  private var next = 1

  /** rc_info's JSON while the engine is open. */
  @Volatile
  var info: String? = null
    private set

  /** Opens the engine from named files read into memory; an engine already open is released first. */
  fun open(items: List<Map<String, String>>, options: String, done: (Map<String, Any?>) -> Unit) = queue.execute {
    closeAll()
    if (!ReciteCoreNative.available) {
      done(mapOf("ok" to false, "code" to RC_ERR_MODEL, "error" to "the native library didn't load"))
      return@execute
    }
    val names = ArrayList<String>(items.size)
    val blobs = ArrayList<ByteArray>(items.size)
    for (item in items) {
      val name = item["name"]
      val data = try {
        item["path"]?.let { File(it).readBytes() }
      } catch (e: Exception) {
        null
      }
      if (name == null || data == null) {
        done(mapOf("ok" to false, "code" to RC_ERR_DATA, "error" to "can't read ${name ?: "a blob"}"))
        return@execute
      }
      names.add(name)
      blobs.add(data)
    }
    val failure = arrayOfNulls<String>(1)
    val code = IntArray(1)
    engine = ReciteCoreNative.open(names.toTypedArray(), blobs.toTypedArray(), options, code, failure)
    if (engine == 0L) {
      done(mapOf("ok" to false, "code" to code[0], "error" to (failure[0] ?: "")))
      return@execute
    }
    val text = ReciteCoreNative.engineInfo(engine)
    info = text
    done(mapOf("ok" to true, "code" to 0, "info" to text))
  }

  /** Starts a take from the contract's start frame. */
  fun start(frame: String, done: (Map<String, Any?>) -> Unit) = queue.execute {
    if (engine == 0L) {
      done(mapOf("code" to RC_ERR_STATE, "error" to "the engine isn't open"))
      return@execute
    }
    val failure = arrayOfNulls<String>(1)
    val code = IntArray(1)
    val session = ReciteCoreNative.start(engine, frame, code, failure)
    if (session == 0L) {
      done(mapOf("code" to code[0], "error" to (failure[0] ?: "")))
      return@execute
    }
    val take = next++
    takes[take] = session
    // Before its first frame: JavaScript has the take's number by the time `ready` reaches it.
    done(mapOf("take" to take))
    drain(take, session, 0)
  }

  /** 16 kHz mono 16-bit little-endian samples. */
  fun feed(take: Int, pcm: ByteArray) = queue.execute {
    val session = takes[take] ?: return@execute
    drain(take, session, ReciteCoreNative.feed(session, pcm, pcm.size / 2))
  }

  fun control(take: Int, frame: String) = queue.execute {
    val session = takes[take] ?: return@execute
    drain(take, session, ReciteCoreNative.control(session, frame))
  }

  fun finish(take: Int) = queue.execute {
    val session = takes[take] ?: return@execute
    drain(take, session, ReciteCoreNative.finish(session))
  }

  fun close(take: Int) = queue.execute {
    val session = takes.remove(take) ?: return@execute
    ReciteCoreNative.close(session)
  }

  /** Closes every take and the engine. */
  fun release(done: () -> Unit) = queue.execute {
    closeAll()
    done()
  }

  private fun closeAll() {
    for (session in takes.values) ReciteCoreNative.close(session)
    takes.clear()
    if (engine != 0L) ReciteCoreNative.release(engine)
    engine = 0L
    info = null
  }

  /** On the queue: everything the take has waiting, then the failed call's code if there was one. */
  private fun drain(take: Int, session: Long, code: Int) {
    val drained = IntArray(1)
    val frames = split(ReciteCoreNative.drain(session, drained))
    val failed = if (code < 0) code else if (drained[0] < 0) drained[0] else 0
    if (frames.isNotEmpty() || failed != 0) emit(take, frames, failed)
  }

  /** The frames as core_jni.c packs them: each a little-endian u32 length and its UTF-8 bytes. */
  private fun split(packed: ByteArray?): List<String> {
    if (packed == null || packed.isEmpty()) return emptyList()
    val buffer = ByteBuffer.wrap(packed).order(ByteOrder.LITTLE_ENDIAN)
    val frames = ArrayList<String>()
    while (buffer.remaining() >= 4) {
      val n = buffer.int
      frames.add(String(packed, buffer.position(), n, Charsets.UTF_8))
      buffer.position(buffer.position() + n)
    }
    return frames
  }

  private companion object {
    // recite_core.h
    const val RC_ERR_DATA = -2
    const val RC_ERR_MODEL = -3
    const val RC_ERR_STATE = -4
  }
}
