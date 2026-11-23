import CryptoKit
import Foundation
import Security

/// This phone's own key for Recite's pack: RSA-2048 in the Keychain, this device only and not extractable. The callable
/// wraps the pack's key to its public half (RSA-OAEP with SHA-1, functions/src/recitePack/handler.ts), so the pack's key
/// can be opened only here, and only in native memory.
enum RecitePackKey {
  private static let tag = Data("app.revisely.recite.pack.device".utf8)

  private static func stored() -> SecKey? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassKey,
      kSecAttrKeyClass as String: kSecAttrKeyClassPrivate,
      kSecAttrKeyType as String: kSecAttrKeyTypeRSA,
      kSecAttrApplicationTag as String: tag,
      kSecReturnRef as String: true,
    ]
    var item: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess, let found = item else { return nil }
    return (found as! SecKey)  // a kSecClassKey query with kSecReturnRef gives a SecKey
  }

  static func privateKey() throws -> SecKey {
    if let key = stored() { return key }
    let attributes: [String: Any] = [
      kSecAttrKeyType as String: kSecAttrKeyTypeRSA,
      kSecAttrKeySizeInBits as String: 2048,
      kSecPrivateKeyAttrs as String: [
        kSecAttrIsPermanent as String: true,
        kSecAttrApplicationTag as String: tag,
        kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        kSecAttrIsExtractable as String: false,
      ],
    ]
    var error: Unmanaged<CFError>?
    guard let key = SecKeyCreateRandomKey(attributes as CFDictionary, &error) else {
      throw RecitePackReader.Failure("can't make the device key: \(error?.takeRetainedValue().localizedDescription ?? "")")
    }
    return key
  }

  /// The public half, PKCS#1 DER in base64 (the form the Keychain exports; the callable takes it as `pkcs1`).
  static func publicKeyBase64() throws -> String {
    var error: Unmanaged<CFError>?
    guard let pub = SecKeyCopyPublicKey(try privateKey()),
          let der = SecKeyCopyExternalRepresentation(pub, &error) as Data? else {
      throw RecitePackReader.Failure("can't read the device key")
    }
    return der.base64EncodedString()
  }

  /// The pack's key, out of its wrapped form.
  static func unwrap(_ wrapped: Data, with key: SecKey) throws -> SymmetricKey {
    var error: Unmanaged<CFError>?
    guard let plain = SecKeyCreateDecryptedData(key, .rsaEncryptionOAEPSHA1, wrapped as CFData, &error) as Data?,
          plain.count == 32 else {
      throw RecitePackReader.Failure("the pack's key doesn't open on this phone")
    }
    return SymmetricKey(data: plain)
  }
}

/// A pack's folder on this phone: `<part>.rcpk` and `key.wrapped`.
enum RecitePackStore {
  private static func keyFile(_ dir: String) -> URL { URL(fileURLWithPath: dir).appendingPathComponent("key.wrapped") }
  private static func partPath(_ dir: String, _ part: String) -> String {
    URL(fileURLWithPath: dir).appendingPathComponent("\(part).rcpk").path
  }

  static func saveKey(dir: String, wrappedBase64: String) throws {
    guard let wrapped = Data(base64Encoded: wrappedBase64) else { throw RecitePackReader.Failure("the wrapped key") }
    try wrapped.write(to: keyFile(dir), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
  }

  private static func packKey(dir: String) throws -> SymmetricKey {
    let wrapped = try Data(contentsOf: keyFile(dir))
    return try RecitePackKey.unwrap(wrapped, with: RecitePackKey.privateKey())
  }

  /// Decrypts the part and checks every chunk and blob; nothing is kept.
  static func verify(dir: String, packId: String, part: String) throws {
    _ = try RecitePackReader.read(path: partPath(dir, part), key: packKey(dir: dir), packId: packId, part: part,
                                  keep: false)
  }

  /// The parts' blobs in memory, for `rc_open` (the transport, A2). They are wiped and freed with the array, so hold it
  /// until `rc_release`.
  static func open(dir: String, packId: String, parts: [String]) throws -> [RecitePackReader.Blob] {
    let key = try packKey(dir: dir)
    var blobs: [RecitePackReader.Blob] = []
    for part in parts {
      blobs += try RecitePackReader.read(path: partPath(dir, part), key: key, packId: packId, part: part, keep: true)
    }
    return blobs
  }
}
