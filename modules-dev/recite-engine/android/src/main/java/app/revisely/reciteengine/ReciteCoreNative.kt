package app.revisely.reciteengine

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
  external fun release(engine: Long)
  external fun engineInfo(engine: Long): String
  external fun start(engine: Long, frame: String, code: IntArray, failure: Array<String?>): Long
  external fun close(session: Long)
  external fun feed(session: Long, pcm: ByteArray, samples: Int): Int
  external fun control(session: Long, frame: String): Int
  external fun finish(session: Long): Int

  /** Every frame waiting, each a little-endian u32 length and its UTF-8 bytes; null when none. code[0]: rh_drain's result. */
  external fun drain(session: Long, code: IntArray): ByteArray?
}
