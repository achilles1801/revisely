package app.revisely.reciteengine

/** The native library holding recite-core or its stub (android/CMakeLists.txt, core/fetch.js). */
internal object ReciteCoreNative {
  private val loaded: Boolean = try {
    System.loadLibrary("reciteengine")
    true
  } catch (_: UnsatisfiedLinkError) {
    false
  }

  private external fun info(): String

  /** core/glue/recite_core_info.h's JSON; a build whose library didn't load reads as the stub. */
  fun infoJson(): String =
    if (loaded) info() else """{"version":"unavailable","abi":0,"headerAbi":0,"stub":true,"selfTest":"skipped"}"""
}
