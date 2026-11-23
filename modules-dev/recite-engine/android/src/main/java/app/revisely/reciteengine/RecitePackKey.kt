package app.revisely.reciteengine

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.io.File
import java.nio.ByteBuffer
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.PrivateKey
import java.util.Arrays

/**
 * This phone's own key for Recite's pack: RSA-2048 in the Android Keystore. The callable wraps the pack's key to its
 * public half (RSA-OAEP with SHA-1, functions/src/recitePack/handler.ts), so the pack's key can be opened only here,
 * and only in native memory.
 */
internal object RecitePackKey {
  private const val STORE = "AndroidKeyStore"
  private const val ALIAS = "revisely.recite.pack.device"

  private fun store(): KeyStore = KeyStore.getInstance(STORE).apply { load(null) }

  private fun ensure(ks: KeyStore) {
    if (ks.containsAlias(ALIAS)) return
    KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_RSA, STORE).run {
      initialize(
        KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_DECRYPT)
          .setKeySize(2048)
          .setDigests(KeyProperties.DIGEST_SHA1)
          .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_RSA_OAEP)
          .build(),
      )
      generateKeyPair()
    }
  }

  /** The public half, X.509 SubjectPublicKeyInfo DER in base64 (the callable takes it as `spki`). */
  fun publicKeyBase64(): String {
    val ks = store()
    ensure(ks)
    return Base64.encodeToString(ks.getCertificate(ALIAS).publicKey.encoded, Base64.NO_WRAP)
  }

  fun unwrap(wrapped: ByteArray): ByteArray {
    val ks = store()
    val key = ks.getKey(ALIAS, null) as? PrivateKey ?: throw IllegalStateException("no device key")
    return RecitePackReader.unwrap(key, wrapped)
  }
}

/** A pack's folder on this phone: `<part>.rcpk` and `key.wrapped`. */
internal object RecitePackStore {
  private fun keyFile(dir: String) = File(dir, "key.wrapped")

  fun saveKey(dir: String, wrappedBase64: String) {
    val wrapped = Base64.decode(wrappedBase64, Base64.NO_WRAP)
    val tmp = File(dir, "key.wrapped.part")
    tmp.writeBytes(wrapped)
    if (!tmp.renameTo(keyFile(dir))) throw IllegalStateException("can't keep the key")
  }

  /** Decrypts the part and checks every chunk and blob; nothing is kept. */
  fun verify(dir: String, packId: String, part: String) {
    val key = RecitePackKey.unwrap(keyFile(dir).readBytes())
    try {
      RecitePackReader.read(File(dir, "$part.rcpk"), key, packId, part, null)
    } finally {
      Arrays.fill(key, 0)
    }
  }

  /**
   * The parts' blobs in memory, for rc_open (the transport, A2). `allocate` gives a direct buffer, 64-byte aligned (the
   * JNI glue's). Call each blob's wipe() after rc_release.
   */
  fun open(dir: String, packId: String, parts: List<String>, allocate: (String, Int) -> ByteBuffer): List<RecitePackReader.Blob> {
    val key = RecitePackKey.unwrap(keyFile(dir).readBytes())
    val blobs = mutableListOf<RecitePackReader.Blob>()
    try {
      for (part in parts) {
        blobs += RecitePackReader.read(File(dir, "$part.rcpk"), key, packId, part) { name, room -> allocate(name, room) }
      }
      return blobs
    } catch (e: Exception) {
      blobs.forEach { it.wipe() }
      throw e
    } finally {
      Arrays.fill(key, 0)
    }
  }
}
