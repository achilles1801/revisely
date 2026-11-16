package app.revisely.recitationaudio

import android.annotation.SuppressLint
import android.content.Context
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.AudioRecordingConfiguration
import android.media.MediaRecorder
import android.os.Build
import android.util.Base64
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.log10
import kotlin.math.max
import kotlin.math.sqrt

// The microphone as 16 kHz mono 16-bit PCM, as the iOS module sends it (ios/RecitationAudioModule.swift): each 100 ms
// goes to JavaScript as base64 with its loudness (`onAudio`), for the recitation checker and following along.
//
// AudioRecord opens the microphone at 16 kHz directly (VOICE_RECOGNITION: the input tuned for speech recognition, without
// the call processing MIC may apply). A reading thread fills 100 ms buffers. Nothing is written to disk.
//
// The capture ends by itself with `onStop` when another app takes the microphone (a call: Android silences this one,
// API 29 on) as "interrupted", or when the input goes away as "route"; JavaScript decides whether to start again, as on
// iOS. The RECORD_AUDIO permission is asked for by JavaScript first (expo-audio), as for recording.

class RecitationAudioModule : Module() {
  private val lock = Any()
  @Volatile private var record: AudioRecord? = null
  @Volatile private var reader: Thread? = null
  @Volatile private var running = false
  private var silencedWatch: AudioManager.AudioRecordingCallback? = null

  override fun definition() = ModuleDefinition {
    Name("RecitationAudio")

    Events("onAudio", "onStop")

    AsyncFunction("start") {
      try {
        startCapture()
      } catch (e: Throwable) {
        teardown()
        throw e
      }
    }

    AsyncFunction("stop") {
      teardown()
    }

    Function("isCapturing") {
      running
    }

    // iOS keeps re-downloadable files out of iCloud backups with this. Android's backups leave those folders out by
    // the app's backup rules (plugins/withAndroidBackupRules), so there is nothing to do for one file.
    Function("excludeFromBackup") { _: String -> }

    OnDestroy {
      teardown()
    }
  }

  @SuppressLint("MissingPermission")
  private fun startCapture() {
    teardown()
    val min = AudioRecord.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
    if (min <= 0) throw IllegalStateException("No microphone input is available.")
    val rec = AudioRecord(
      MediaRecorder.AudioSource.VOICE_RECOGNITION,
      SAMPLE_RATE,
      AudioFormat.CHANNEL_IN_MONO,
      AudioFormat.ENCODING_PCM_16BIT,
      // Room for a few buffers, so a busy moment on the reading thread loses nothing.
      max(min, CHUNK * 2 * 4),
    )
    if (rec.state != AudioRecord.STATE_INITIALIZED) {
      rec.release()
      throw IllegalStateException("The microphone couldn't be opened.")
    }
    rec.startRecording()
    if (rec.recordingState != AudioRecord.RECORDSTATE_RECORDING) {
      rec.release()
      throw IllegalStateException("The microphone is in use by another app.")
    }
    synchronized(lock) {
      record = rec
      running = true
      watchSilencing(rec)
      reader = Thread({ readLoop(rec) }, "recitation-audio").also { it.start() }
    }
  }

  private fun readLoop(rec: AudioRecord) {
    val buffer = ShortArray(CHUNK)
    var filled = 0
    while (running) {
      val n = rec.read(buffer, filled, CHUNK - filled)
      if (n < 0) {
        // The input is gone (ERROR_DEAD_OBJECT: unplugged, the audio server restarted) or broken.
        if (running) stopFor(if (n == AudioRecord.ERROR_DEAD_OBJECT) "route" else "interrupted")
        return
      }
      filled += n
      if (filled == CHUNK) {
        deliver(buffer, filled)
        filled = 0
      }
    }
  }

  private fun deliver(samples: ShortArray, count: Int) {
    val bytes = ByteBuffer.allocate(count * 2).order(ByteOrder.LITTLE_ENDIAN)
    var sum = 0.0
    for (i in 0 until count) {
      val s = samples[i]
      sum += s.toDouble() * s
      bytes.putShort(s)
    }
    val rms = sqrt(sum / count) / 32768.0
    val level = if (rms > 0) max(-100.0, 20 * log10(rms)) else -100.0
    sendEvent("onAudio", mapOf("data" to Base64.encodeToString(bytes.array(), Base64.NO_WRAP), "level" to level))
  }

  /** API 29 on: Android silences this capture while another app (a call) has the microphone; that ends it, as on iOS. */
  private fun watchSilencing(rec: AudioRecord) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return
    val manager = audioManager() ?: return
    val session = rec.audioSessionId
    val watch = object : AudioManager.AudioRecordingCallback() {
      override fun onRecordingConfigChanged(configs: MutableList<AudioRecordingConfiguration>) {
        val mine = configs.firstOrNull { it.clientAudioSessionId == session } ?: return
        if (mine.isClientSilenced && running) Thread { stopFor("interrupted") }.start()
      }
    }
    manager.registerAudioRecordingCallback(watch, null)
    silencedWatch = watch
  }

  private fun audioManager(): AudioManager? =
    appContext.reactContext?.getSystemService(Context.AUDIO_SERVICE) as? AudioManager

  private fun stopFor(reason: String) {
    synchronized(lock) {
      if (!running) return
      teardownLocked()
    }
    sendEvent("onStop", mapOf("reason" to reason))
  }

  private fun teardown() {
    synchronized(lock) { teardownLocked() }
  }

  private fun teardownLocked() {
    running = false
    val rec = record
    val thread = reader
    record = null
    reader = null
    silencedWatch?.let { watch ->
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) audioManager()?.unregisterAudioRecordingCallback(watch)
    }
    silencedWatch = null
    try {
      rec?.stop()
    } catch (_: IllegalStateException) {
      // Never started, or already stopped.
    }
    // The reading thread returns once stop() ends its read; it's released only after, never mid-read.
    if (thread != null && thread !== Thread.currentThread()) thread.join(500)
    rec?.release()
  }

  private companion object {
    const val SAMPLE_RATE = 16000
    /** 100 ms a buffer, as iOS sends. */
    const val CHUNK = SAMPLE_RATE / 10
  }
}
