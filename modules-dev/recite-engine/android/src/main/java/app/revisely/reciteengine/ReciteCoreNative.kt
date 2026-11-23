package app.revisely.reciteengine

import java.nio.ByteBuffer

/** The native library holding recite-core or its stub (android/CMakeLists.txt, core/fetch.js), and its JNI (core_jni.c). */
internal object ReciteCoreNative {
  private val loaded: Boolean = try {
    System.loadLibrary("reciteengine")
    true
  } catch (_: UnsatisfiedLinkError) {
    false
  }

  /** Whether the calls below can be made. */
  val available: Boolean get() = loaded

  private external fun info(): String

  /** core/glue/recite_core_info.h's JSON; a build whose library didn't load reads as the stub. */
  fun infoJson(): String =
    if (loaded) info() else """{"version":"unavailable","abi":0,"headerAbi":0,"stub":true,"selfTest":"skipped"}"""

  // recite_core.h, called only from EngineHost's thread. A handle of 0 is a failure, with code[0] and failure[0] set.
  external fun open(names: Array<String>, blobs: Array<ByteArray>, options: String, code: IntArray, failure: Array<String?>): Long
  /** rc_open over direct buffers (allocBlob's), read without copying: they must outlive the engine. */
  external fun openBlobs(names: Array<String>, buffers: Array<ByteBuffer>, options: String, code: IntArray, failure: Array<String?>): Long
  external fun release(engine: Long)
  external fun engineInfo(engine: Long): String
  external fun start(engine: Long, frame: String, code: IntArray, failure: Array<String?>): Long
  external fun close(session: Long)
  external fun feed(session: Long, pcm: ByteArray, samples: Int): Int
  external fun control(session: Long, frame: String): Int
  external fun finish(session: Long): Int

  /** rc_clip: samples [s0, s1) as little-endian bytes; null unless all of them are there (20 s at most). */
  external fun clip(session: Long, s0: Long, s1: Long): ByteArray?

  /** A direct buffer outside the Java heap, 64-byte aligned, for a pack blob; null without the memory. Free it with freeBlob. */
  external fun allocBlob(size: Int): ByteBuffer?
  external fun freeBlob(buffer: ByteBuffer)

  /** Every frame waiting, each a little-endian u32 length and its UTF-8 bytes; null when none. code[0]: rh_drain's result. */
  external fun drain(session: Long, code: IntArray): ByteArray?

  // recite_host.h's meter, held in a DoubleArray: how a take kept up.
  external fun meterStart(hop: Double, thermal: Int): DoubleArray?
  external fun meterFed(meter: DoubleArray, samples: Int, ms: Double, waiting: Long)
  external fun meterFrame(meter: DoubleArray, thermal: Int): String?
}
