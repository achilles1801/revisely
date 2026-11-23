/**
 * Recite's pack on the phone (BEHAVIOUR.md ONDEV-2; on-device-plan.md §6 and §13): the format of one part, `.rcpk`.
 *
 * The format is public: what keeps the pack private is its key, which never ships in the app or the repository and
 * reaches a phone only wrapped to that phone's own key (handler.ts). The phone's module reads the same bytes
 * (modules-dev/recite-engine), and functions/scripts/recite-pack-make.js writes them with this file.
 *
 * A part holds named blobs, the names recite-core's rc_open takes (recite_core.h: "v7.graph.onnx", "v7.weights.f16",
 * "v7.weights.json", "words.rcwt", "ayahs.bin", … ; "v5.onnx", "strict.bin").
 *
 * The container (plaintext, never written to disk on a phone):
 *   "RCPC" u32 version(2) u32 n, then n × (str name, u8 codec, u64 offset, u64 stored, u64 size, u64 room,
 *   u8[32] sha256), then the blobs. Offsets count from the first blob's byte; `stored` is the bytes the blob takes
 *   there, `size` its bytes once read, and the sha256 is of those. `room` is the buffer the phone gives the engine for
 *   it, 64-byte aligned, the blob at its start: its size, except "v7.weights.f16", which the engine widens in place to
 *   the fp32 size (fp32_bytes in v7.weights.json; rc_blob.size is `room`). codec 0: stored as it is. codec 1: raw
 *   DEFLATE, for a blob it shrinks by at least a tenth (the word table, 30.6 → 6.2 MB). The model's weights stay stored:
 *   they barely shrink, and a phone puts them straight into the buffer the engine runs them from.
 *
 * The file (.rcpk): a header, then the container sealed with AES-256-GCM in chunks.
 *   "RCPK" u32 format(1) str pack_id str part u32 chunk u64 plain_size u8[8] nonce_prefix
 *   Chunk i: ciphertext ‖ 16-byte tag, nonce = nonce_prefix ‖ u32be(i), AAD = header ‖ u32be(i) ‖ u8(last).
 *   So no chunk can be moved, dropped, cut short or taken into another pack or part without its tag failing, and a
 *   phone decrypts straight from the file into one buffer.
 *
 * Integers are little-endian unless marked be; str is a u16 byte length, then UTF-8 (as checker/pack.py writes).
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { deflateRawSync, inflateRawSync } from 'zlib';

export const RCPK_FORMAT = 1;
export const RCPC_VERSION = 2;
export const CODEC_STORED = 0;
export const CODEC_DEFLATE = 1;
export const DEFAULT_CHUNK = 1 << 20;
export const TAG_BYTES = 16;
export const KEY_BYTES = 32;
export const NONCE_PREFIX_BYTES = 8;

/** The parts a pack downloads in: Recite and Mark mistakes need `core`, Strict needs `strict` too. */
export const PACK_PARTS = ['core', 'strict'] as const;
export type PackPart = (typeof PACK_PARTS)[number];

/** A pack's id: a new one for every new model, table or engine data version, and so a new key. */
export const PACK_ID = /^[a-z0-9][a-z0-9.-]{0,39}$/;

/**
 * A pack's id from what it holds: any file's hash changing makes a new id, so a version is never reused or overwritten,
 * and the same files always have the same id.
 */
export function contentPackId(files: { part: string; name: string; sha256: string }[], prefix = 'v7m'): string {
  const lines = files.map((f) => `${f.part}/${f.name} ${f.sha256}`).sort();
  return `${prefix}-${createHash('sha256').update(lines.join('\n')).digest('hex').slice(0, 12)}`;
}

export interface PackBlob {
  name: string;
  data: Buffer;
  /** The buffer a phone gives the engine for it, when larger than the data. */
  room?: number;
}

export interface RcpkHeader {
  packId: string;
  part: PackPart;
  chunk: number;
  plainSize: number;
  noncePrefix: Buffer;
}

export class PackFormatError extends Error {}

function u16(n: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n);
  return b;
}
function u32(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
}
function u64(n: number): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n));
  return b;
}
function str(s: string): Buffer {
  const b = Buffer.from(s, 'utf8');
  if (b.length > 0xffff) throw new PackFormatError('string too long');
  return Buffer.concat([u16(b.length), b]);
}

/** Reads the format's fields in order, refusing to run past the end. */
class Reader {
  pos = 0;
  constructor(private readonly buf: Buffer) {}
  private need(n: number): void {
    if (this.pos + n > this.buf.length) throw new PackFormatError('cut short');
  }
  bytes(n: number): Buffer {
    this.need(n);
    const b = this.buf.subarray(this.pos, this.pos + n);
    this.pos += n;
    return b;
  }
  u16(): number {
    this.need(2);
    const v = this.buf.readUInt16LE(this.pos);
    this.pos += 2;
    return v;
  }
  u32(): number {
    this.need(4);
    const v = this.buf.readUInt32LE(this.pos);
    this.pos += 4;
    return v;
  }
  u64(): number {
    this.need(8);
    const v = this.buf.readBigUInt64LE(this.pos);
    this.pos += 8;
    if (v > BigInt(Number.MAX_SAFE_INTEGER)) throw new PackFormatError('size out of range');
    return Number(v);
  }
  str(): string {
    return this.bytes(this.u16()).toString('utf8');
  }
}

const sha256 = (b: Buffer): Buffer => createHash('sha256').update(b).digest();

/** A blob as the container holds it: deflated when that saves at least a tenth, else as it is. */
function encodeBlob(data: Buffer): { codec: number; stored: Buffer } {
  if (data.length === 0) return { codec: CODEC_STORED, stored: data };
  const z = deflateRawSync(data, { level: 9 });
  return z.length * 10 <= data.length * 9 ? { codec: CODEC_DEFLATE, stored: z } : { codec: CODEC_STORED, stored: data };
}

/** The container: a table of the blobs (name, codec, place, sizes, sha256), then the blobs. */
export function packContainer(blobs: PackBlob[]): Buffer {
  const names = new Set<string>();
  let offset = 0;
  const table: Buffer[] = [Buffer.from('RCPC'), u32(RCPC_VERSION), u32(blobs.length)];
  const body: Buffer[] = [];
  for (const b of blobs) {
    if (!b.name || names.has(b.name)) throw new PackFormatError(`blob name ${JSON.stringify(b.name)} empty or repeated`);
    names.add(b.name);
    const room = b.room ?? b.data.length;
    if (!Number.isSafeInteger(room) || room < b.data.length) throw new PackFormatError(`${b.name}: room smaller than its data`);
    const { codec, stored } = encodeBlob(b.data);
    table.push(str(b.name), Buffer.from([codec]), u64(offset), u64(stored.length), u64(b.data.length), u64(room), sha256(b.data));
    body.push(stored);
    offset += stored.length;
  }
  return Buffer.concat([...table, ...body]);
}

/** The blobs back out of a container, each read to its size and checked against its sha256. */
export function unpackContainer(buf: Buffer): PackBlob[] {
  const r = new Reader(buf);
  if (r.bytes(4).toString('latin1') !== 'RCPC') throw new PackFormatError('not a container');
  if (r.u32() !== RCPC_VERSION) throw new PackFormatError('container version');
  const n = r.u32();
  const rows: { name: string; codec: number; offset: number; stored: number; size: number; room: number; hash: Buffer }[] = [];
  for (let i = 0; i < n; i++) {
    const name = r.str();
    const codec = r.bytes(1)[0];
    rows.push({ name, codec, offset: r.u64(), stored: r.u64(), size: r.u64(), room: r.u64(), hash: Buffer.from(r.bytes(32)) });
  }
  const base = r.pos;
  return rows.map((row) => {
    const start = base + row.offset;
    if (start + row.stored > buf.length) throw new PackFormatError(`${row.name} runs past the end`);
    if (row.room < row.size) throw new PackFormatError(`${row.name}: room smaller than its data`);
    const held = buf.subarray(start, start + row.stored);
    let data: Buffer;
    if (row.codec === CODEC_STORED) {
      if (row.stored !== row.size) throw new PackFormatError(`${row.name}: stored and read sizes differ`);
      data = held;
    } else if (row.codec === CODEC_DEFLATE) {
      try {
        data = inflateRawSync(held, { maxOutputLength: Math.max(1, row.size) });
      } catch {
        throw new PackFormatError(`${row.name} doesn't inflate to its size`);
      }
    } else {
      throw new PackFormatError(`${row.name}: unknown codec ${row.codec}`);
    }
    if (data.length !== row.size) throw new PackFormatError(`${row.name} doesn't inflate to its size`);
    if (!sha256(data).equals(row.hash)) throw new PackFormatError(`${row.name} doesn't match its sha256`);
    return { name: row.name, data, room: row.room };
  });
}

export function headerBytes(h: RcpkHeader): Buffer {
  if (!PACK_ID.test(h.packId)) throw new PackFormatError(`pack id ${JSON.stringify(h.packId)}`);
  if (!PACK_PARTS.includes(h.part)) throw new PackFormatError(`part ${JSON.stringify(h.part)}`);
  if (h.noncePrefix.length !== NONCE_PREFIX_BYTES) throw new PackFormatError('nonce prefix');
  if (!Number.isInteger(h.chunk) || h.chunk < 1024 || h.chunk > 64 << 20) throw new PackFormatError('chunk size');
  return Buffer.concat([
    Buffer.from('RCPK'),
    u32(RCPK_FORMAT),
    str(h.packId),
    str(h.part),
    u32(h.chunk),
    u64(h.plainSize),
    h.noncePrefix,
  ]);
}

export function readHeader(file: Buffer): { header: RcpkHeader; length: number } {
  const r = new Reader(file);
  if (r.bytes(4).toString('latin1') !== 'RCPK') throw new PackFormatError('not a pack part');
  if (r.u32() !== RCPK_FORMAT) throw new PackFormatError('pack format');
  const packId = r.str();
  const part = r.str() as PackPart;
  const chunk = r.u32();
  const plainSize = r.u64();
  const noncePrefix = Buffer.from(r.bytes(NONCE_PREFIX_BYTES));
  const header = { packId, part, chunk, plainSize, noncePrefix };
  headerBytes(header); // the same checks as writing
  return { header, length: r.pos };
}

/** How many chunks a part of this size has: at least one, so even an empty part carries a tag. */
export function chunkCount(plainSize: number, chunk: number): number {
  return Math.max(1, Math.ceil(plainSize / chunk));
}

/** The exact size of a sealed part: the downloaded file must be this long. */
export function sealedSize(header: RcpkHeader): number {
  return headerBytes(header).length + header.plainSize + chunkCount(header.plainSize, header.chunk) * TAG_BYTES;
}

function chunkNonce(prefix: Buffer, i: number): Buffer {
  const n = Buffer.alloc(12);
  n.set(prefix, 0);
  n.writeUInt32BE(i, NONCE_PREFIX_BYTES);
  return n;
}

function chunkAad(header: Buffer, i: number, last: boolean): Buffer {
  const tail = Buffer.alloc(5);
  tail.writeUInt32BE(i, 0);
  tail[4] = last ? 1 : 0;
  return Buffer.concat([header, tail]);
}

/** Seals a container as one part of a pack. A fresh nonce prefix every time unless given (tests). */
export function seal(
  plain: Buffer,
  key: Buffer,
  opts: { packId: string; part: PackPart; chunk?: number; noncePrefix?: Buffer },
): Buffer {
  if (key.length !== KEY_BYTES) throw new PackFormatError('key size');
  const header: RcpkHeader = {
    packId: opts.packId,
    part: opts.part,
    chunk: opts.chunk ?? DEFAULT_CHUNK,
    plainSize: plain.length,
    noncePrefix: opts.noncePrefix ?? randomBytes(NONCE_PREFIX_BYTES),
  };
  const head = headerBytes(header);
  const n = chunkCount(plain.length, header.chunk);
  const out: Buffer[] = [head];
  for (let i = 0; i < n; i++) {
    const c = createCipheriv('aes-256-gcm', key, chunkNonce(header.noncePrefix, i), { authTagLength: TAG_BYTES });
    c.setAAD(chunkAad(head, i, i === n - 1));
    out.push(c.update(plain.subarray(i * header.chunk, (i + 1) * header.chunk)), c.final(), c.getAuthTag());
  }
  return Buffer.concat(out);
}

/**
 * The container back out of a sealed part, every chunk's tag checked. `expect` names the pack and part the caller
 * asked for, so a part of another pack (or the other part) is refused even with the right key.
 */
export function open(file: Buffer, key: Buffer, expect?: { packId?: string; part?: PackPart }): Buffer {
  if (key.length !== KEY_BYTES) throw new PackFormatError('key size');
  const { header, length } = readHeader(file);
  if (expect?.packId !== undefined && header.packId !== expect.packId) throw new PackFormatError('another pack');
  if (expect?.part !== undefined && header.part !== expect.part) throw new PackFormatError('another part');
  if (file.length !== sealedSize(header)) throw new PackFormatError('wrong length');
  const head = file.subarray(0, length);
  const n = chunkCount(header.plainSize, header.chunk);
  const out = Buffer.alloc(header.plainSize);
  let at = length;
  for (let i = 0; i < n; i++) {
    const size = Math.min(header.chunk, header.plainSize - i * header.chunk);
    const d = createDecipheriv('aes-256-gcm', key, chunkNonce(header.noncePrefix, i), { authTagLength: TAG_BYTES });
    d.setAAD(chunkAad(head, i, i === n - 1));
    d.setAuthTag(file.subarray(at + size, at + size + TAG_BYTES));
    const part = d.update(file.subarray(at, at + size));
    try {
      d.final();
    } catch {
      throw new PackFormatError(`chunk ${i} failed its check`);
    }
    out.set(part, i * header.chunk);
    at += size + TAG_BYTES;
  }
  return out;
}
