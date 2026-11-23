// The iOS pack reader against the vectors (vectors.js). Built by run.sh with RecitePackReader.swift and RecitePackKey.swift.
import CryptoKit
import Foundation
import Security

let folder = CommandLine.arguments[1]
let text = try String(contentsOfFile: folder + "/vectors.txt", encoding: .utf8)
var keyBytes = Data()
var passed = 0, refused = 0, failed = 0
func hex(_ s: Substring) -> Data {
  var out = Data()
  var i = s.startIndex
  while i < s.endIndex {
    let j = s.index(i, offsetBy: 2)
    out.append(UInt8(s[i..<j], radix: 16)!)
    i = j
  }
  return out
}
for line in text.split(separator: "\n") {
  let f = line.split(separator: "\t", omittingEmptySubsequences: false).map(String.init)
  switch f[0] {
  case "key":
    keyBytes = hex(Substring(f[1]))
  case "rsa":
    let attrs: [String: Any] = [kSecAttrKeyType as String: kSecAttrKeyTypeRSA, kSecAttrKeyClass as String: kSecAttrKeyClassPrivate]
    let priv = SecKeyCreateWithData(Data(base64Encoded: f[1])! as CFData, attrs as CFDictionary, nil)!
    let back = try RecitePackKey.unwrap(Data(base64Encoded: f[3])!, with: priv)
    let same = back.withUnsafeBytes { Data($0) } == keyBytes
    print("unwrap (RSA-OAEP SHA-1):", same ? "ok" : "DIFFERS")
    if !same { failed += 1 }
  case "ok":
    do {
      let path = folder + "/" + f[1]
      try _ = RecitePackReader.read(path: path, key: SymmetricKey(data: keyBytes), packId: f[2], part: f[3], keep: false)
      let t0 = Date()
      let blobs = try RecitePackReader.read(path: path, key: SymmetricKey(data: keyBytes), packId: f[2], part: f[3], keep: true)
      let ms = Date().timeIntervalSince(t0) * 1000
      var good = blobs.count == f.count - 4
      for (b, want) in zip(blobs, f[4...]) {
        let w = want.split(separator: ":")
        let digest = SHA256.hash(data: UnsafeRawBufferPointer(start: b.data, count: b.size))
        good = good && b.name == w[0] && b.size == Int(w[1]) && b.room == Int(w[2]) && Int(bitPattern: b.data) % 64 == 0
          && Data(digest) == hex(w[3])
      }
      if good { passed += 1 } else { failed += 1; print("DIFFERS", f[1]) }
      if f[1].hasPrefix("real-") { print(f[1], "opened in", Int(ms), "ms") }
    } catch {
      failed += 1
      print("FAILED", f[1], error)
    }
  case "bad":
    for keep in [false, true] {
      do {
        _ = try RecitePackReader.read(path: folder + "/" + f[1], key: SymmetricKey(data: keyBytes), packId: f[2], part: f[3], keep: keep)
        failed += 1
        print("NOT REFUSED", f[1], f[4])
      } catch { refused += 1 }
    }
  default: break
  }
}
print("swift: \(passed) read, \(refused) refused, \(failed) wrong")
exit(failed == 0 ? 0 : 1)
