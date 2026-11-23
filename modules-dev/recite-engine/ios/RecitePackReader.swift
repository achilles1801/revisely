import Compression
import CryptoKit
import Foundation

/// Reads one sealed part of Recite's pack (`.rcpk`; the format is functions/src/recitePack/format.ts).
/// Every chunk's tag, the header and each blob's sha256 are checked. With `keep` the blobs land in 64-byte aligned
/// buffers of their `room`; without it they are checked and dropped, so a check never holds the pack in memory.
enum RecitePackReader {
  struct Failure: Error, CustomStringConvertible {
    let description: String
    init(_ description: String) { self.description = description }
  }

  /// A blob in memory, as `rc_blob` takes it (`room` is its size there). Wiped and freed with the object, so whoever
  /// opens the engine holds these until `rc_release`.
  final class Blob {
    let name: String
    let data: UnsafeMutableRawPointer
    let size: Int
    let room: Int

    init(name: String, size: Int, room: Int) throws {
      var raw: UnsafeMutableRawPointer?
      guard posix_memalign(&raw, 64, max(room, 1)) == 0, let memory = raw else {
        throw Failure("no memory for \(name)")
      }
      self.name = name
      self.data = memory
      self.size = size
      self.room = room
    }

    deinit {
      memset_s(data, room, 0, room)
      free(data)
    }
  }

  private static let tagBytes = 16
  private static let inflateBytes = 1 << 18

  private struct Row {
    let name: String
    let codec: UInt8
    let offset: UInt64
    let stored: UInt64
    let size: UInt64
    let room: UInt64
    let sha256: Data
  }

  /// Little-endian fields of a header or a table, refusing to run past the end.
  private struct Fields {
    let bytes: Data
    var at: Int

    init(_ bytes: Data) {
      self.bytes = bytes
      at = bytes.startIndex
    }

    mutating func take(_ n: Int) throws -> Data {
      guard n >= 0, at + n <= bytes.endIndex else { throw Failure("cut short") }
      defer { at += n }
      return bytes.subdata(in: at..<(at + n))
    }

    mutating func int(_ n: Int) throws -> UInt64 {
      var value: UInt64 = 0
      for (i, byte) in try take(n).enumerated() { value |= UInt64(byte) << UInt64(8 * i) }
      return value
    }

    mutating func str() throws -> String {
      let n = Int(try int(2))
      guard let text = String(data: try take(n), encoding: .utf8) else { throw Failure("a name isn't UTF-8") }
      return text
    }
  }

  /// One blob being read: its hash, its place in memory, and an inflate stream when it is deflated.
  private final class Sink {
    let row: Row
    let blob: Blob?
    private var written = 0
    private var hasher = SHA256()
    private var stream: UnsafeMutablePointer<compression_stream>?
    private var scratch: UnsafeMutablePointer<UInt8>?
    private var ended = false

    init(_ row: Row, keep: Bool) throws {
      self.row = row
      guard row.size <= UInt64(Int.max), row.room <= UInt64(Int.max), row.room >= row.size else {
        throw Failure("\(row.name): sizes")
      }
      blob = keep ? try Blob(name: row.name, size: Int(row.size), room: Int(row.room)) : nil
      switch row.codec {
      case 0:
        guard row.stored == row.size else { throw Failure("\(row.name): stored and read sizes differ") }
      case 1:
        let s = UnsafeMutablePointer<compression_stream>.allocate(capacity: 1)
        guard compression_stream_init(s, COMPRESSION_STREAM_DECODE, COMPRESSION_ZLIB) == COMPRESSION_STATUS_OK else {
          s.deallocate()
          throw Failure("\(row.name): can't inflate")
        }
        stream = s
        scratch = UnsafeMutablePointer<UInt8>.allocate(capacity: RecitePackReader.inflateBytes)
      default:
        throw Failure("\(row.name): unknown codec \(row.codec)")
      }
    }

    deinit {
      if let s = stream {
        compression_stream_destroy(s)
        s.deallocate()
      }
      if let b = scratch {
        memset_s(b, RecitePackReader.inflateBytes, 0, RecitePackReader.inflateBytes)
        b.deallocate()
      }
    }

    private func put(_ p: UnsafePointer<UInt8>, _ n: Int) throws {
      guard n > 0 else { return }
      guard UInt64(written) + UInt64(n) <= row.size else { throw Failure("\(row.name) is longer than its size") }
      hasher.update(bufferPointer: UnsafeRawBufferPointer(start: p, count: n))
      if let blob { memcpy(blob.data + written, p, n) }
      written += n
    }

    func feed(_ p: UnsafePointer<UInt8>, _ n: Int) throws {
      guard let s = stream, let out = scratch else {
        try put(p, n)
        return
      }
      guard !ended || n == 0 else { throw Failure("\(row.name): data after its end") }
      s.pointee.src_ptr = p
      s.pointee.src_size = n
      while s.pointee.src_size > 0 && !ended { try step(s, out, finalize: false) }
      if s.pointee.src_size > 0 { throw Failure("\(row.name): data after its end") }
    }

    private func step(_ s: UnsafeMutablePointer<compression_stream>, _ out: UnsafeMutablePointer<UInt8>,
                      finalize: Bool) throws {
      s.pointee.dst_ptr = out
      s.pointee.dst_size = RecitePackReader.inflateBytes
      let flags = finalize ? Int32(COMPRESSION_STREAM_FINALIZE.rawValue) : 0
      let status = compression_stream_process(s, flags)
      guard status != COMPRESSION_STATUS_ERROR else { throw Failure("\(row.name) doesn't inflate") }
      try put(out, RecitePackReader.inflateBytes - s.pointee.dst_size)
      if status == COMPRESSION_STATUS_END { ended = true }
    }

    func finish() throws {
      if let s = stream, let out = scratch {
        s.pointee.src_ptr = UnsafePointer(out)
        s.pointee.src_size = 0
        var rounds = 0
        while !ended {
          let before = written
          try step(s, out, finalize: true)
          rounds = written == before ? rounds + 1 : 0
          if rounds > 1 && !ended { throw Failure("\(row.name) doesn't inflate") }
        }
      }
      guard UInt64(written) == row.size else { throw Failure("\(row.name) isn't its size") }
      guard Data(hasher.finalize()) == row.sha256 else { throw Failure("\(row.name) doesn't match its sha256") }
    }
  }

  /// The part at `path`, sealed with `key`, for this pack and part. Throws on anything that doesn't check out.
  static func read(path: String, key: SymmetricKey, packId: String, part: String, keep: Bool) throws -> [Blob] {
    guard let file = FileHandle(forReadingAtPath: path) else { throw Failure("can't open \(part)") }
    defer { try? file.close() }
    let fileSize = try file.seekToEnd()
    try file.seek(toOffset: 0)

    // the header
    let start = try file.read(upToCount: 4 + 4 + 2 + 255 + 2 + 255 + 4 + 8 + 8) ?? Data()
    var h = Fields(start)
    guard try h.take(4) == Data("RCPK".utf8) else { throw Failure("not a pack part") }
    guard try h.int(4) == 1 else { throw Failure("pack format") }
    guard try h.str() == packId else { throw Failure("another pack") }
    guard try h.str() == part else { throw Failure("another part") }
    let chunk = Int(try h.int(4))
    let plainSize = try h.int(8)
    let prefix = try h.take(8)
    guard chunk >= 1024, chunk <= 64 << 20, plainSize <= UInt64(Int.max) else { throw Failure("chunk size") }
    let headLength = h.at - start.startIndex
    let head = start.subdata(in: start.startIndex..<(start.startIndex + headLength))
    let chunks = max(1, Int((plainSize + UInt64(chunk) - 1) / UInt64(chunk)))
    guard fileSize == UInt64(headLength) + plainSize + UInt64(chunks * tagBytes) else { throw Failure("wrong length") }
    try file.seek(toOffset: UInt64(headLength))

    var sinks: [Sink] = []
    var current = 0
    var doneInBlob: UInt64 = 0
    var bodyLeft: UInt64 = 0

    func take(_ p: UnsafePointer<UInt8>, _ count: Int) throws {
      var p = p
      var n = count
      while n > 0 {
        while current < sinks.count, sinks[current].row.stored == doneInBlob {
          try sinks[current].finish()
          current += 1
          doneInBlob = 0
        }
        guard current < sinks.count else { throw Failure("data past the last blob") }
        let k = Int(min(UInt64(n), sinks[current].row.stored - doneInBlob))
        try sinks[current].feed(p, k)
        p += k
        n -= k
        doneInBlob += UInt64(k)
      }
    }

    for i in 0..<chunks {
      let size = min(chunk, Int(plainSize) - i * chunk)
      guard let sealed = try file.read(upToCount: size + tagBytes), sealed.count == size + tagBytes else {
        throw Failure("cut short")
      }
      var nonce = prefix
      var aad = head
      let index = withUnsafeBytes(of: UInt32(i).bigEndian) { Data($0) }
      nonce.append(index)
      aad.append(index)
      aad.append(i == chunks - 1 ? 1 : 0)
      let plain: Data
      do {
        let box = try AES.GCM.SealedBox(nonce: AES.GCM.Nonce(data: nonce),
                                        ciphertext: sealed.prefix(size),
                                        tag: sealed.suffix(tagBytes))
        plain = try AES.GCM.open(box, using: key, authenticating: aad)
      } catch {
        throw Failure("chunk \(i) failed its check")
      }

      var body = plain
      if i == 0 {
        // the blobs' table, which is all in the first chunk
        var t = Fields(plain)
        guard try t.take(4) == Data("RCPC".utf8) else { throw Failure("not a container") }
        guard try t.int(4) == 2 else { throw Failure("container version") }
        let n = Int(try t.int(4))
        guard n <= 256 else { throw Failure("too many blobs") }
        var next: UInt64 = 0
        var names = Set<String>()
        for _ in 0..<n {
          let name = try t.str()
          let codec = UInt8(try t.int(1))
          let row = Row(name: name, codec: codec, offset: try t.int(8), stored: try t.int(8), size: try t.int(8),
                        room: try t.int(8), sha256: try t.take(32))
          guard row.offset == next, names.insert(name).inserted else { throw Failure("the blobs' table") }
          next += row.stored
          sinks.append(try Sink(row, keep: keep))
        }
        let tableLength = t.at - plain.startIndex
        guard UInt64(tableLength) + next == plainSize else { throw Failure("the blobs don't fill the part") }
        bodyLeft = next
        body = plain.subdata(in: t.at..<plain.endIndex)
      }
      bodyLeft -= UInt64(body.count)
      try body.withUnsafeBytes { raw in
        if let base = raw.bindMemory(to: UInt8.self).baseAddress { try take(base, raw.count) }
      }
    }
    guard bodyLeft == 0 else { throw Failure("cut short") }
    while current < sinks.count {
      guard sinks[current].row.stored == doneInBlob else { throw Failure("cut short") }
      try sinks[current].finish()
      current += 1
      doneInBlob = 0
    }
    return keep ? sinks.compactMap(\.blob) : []
  }
}
