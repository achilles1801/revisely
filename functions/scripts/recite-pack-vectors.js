#!/usr/bin/env node
/**
 * Test vectors for the phone's pack readers (modules-dev/recite-engine: RecitePackReader.swift and .java), sealed by the
 * server's own format code, so the three stay one format. Writes OUT/*.rcpk and OUT/vectors.txt (one case a line, tab
 * separated, because the Java check has no JSON). Needs `npm run build` in functions/. Run through
 * scripts/recite-pack-check/run.sh.
 *   node recite-pack-vectors.js OUT [REAL_DIR...]   each REAL_DIR: name=path,... of a real part (`core:` or `strict:` first)
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const F = require('../lib/recitePack/format');

const out = process.argv[2];
fs.mkdirSync(out, { recursive: true });
const key = crypto.randomBytes(32);
const lines = [`key\t${key.toString('hex')}`];

const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const wrapped = crypto.publicEncrypt({ key: rsa.publicKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha1' }, key);
lines.push(['rsa', rsa.privateKey.export({ format: 'der', type: 'pkcs1' }).toString('base64'),
  rsa.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'), wrapped.toString('base64')].join('\t'));

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const blobInfo = (b) => `${b.name}:${b.data.length}:${b.room ?? b.data.length}:${sha(b.data)}`;
function ok(name, blobs, packId, part, chunk) {
  fs.writeFileSync(path.join(out, name), F.seal(F.packContainer(blobs), key, { packId, part, chunk }));
  lines.push(['ok', name, packId, part, ...blobs.map(blobInfo)].join('\t'));
}
function bad(name, bytes, packId, part, why) {
  fs.writeFileSync(path.join(out, name), bytes);
  lines.push(['bad', name, packId, part, why].join('\t'));
}

const table = Buffer.from('the same words again and again, '.repeat(40000));
const weights = crypto.randomBytes(300_000);
const set = () => [
  { name: 'v7.graph.onnx', data: crypto.randomBytes(5000) },
  { name: 'v7.weights.f16', data: weights, room: weights.length * 2 + 20 },
  { name: 'words.rcwt', data: table },
  { name: 'config.json', data: Buffer.from('{"vocab":["a"]}') },
];
ok('small-chunks.rcpk', set(), 'v7m-1', 'core', 1024);
ok('one-mib.rcpk', set(), 'v7m-1', 'core', 1 << 20);
const v5Weights = crypto.randomBytes(120_000);
ok('strict.rcpk', [{ name: 'strict.bin', data: Buffer.alloc(70_000, 3) }, { name: 'v5.graph.onnx', data: crypto.randomBytes(9000) },
  { name: 'v5.weights.f16', data: v5Weights, room: v5Weights.length * 2 + 20 }], 'v7m-1', 'strict');
ok('table-only.rcpk', [{ name: 'a', data: Buffer.from('x') }], 'p', 'core', 1024);

const good = F.seal(F.packContainer(set()), key, { packId: 'v7m-1', part: 'core', chunk: 4096 });
const head = F.readHeader(good).length;
const flip = (at) => { const b = Buffer.from(good); b[at] ^= 1; return b; };
bad('flip-first.rcpk', flip(head + 3), 'v7m-1', 'core', 'a chunk changed');
bad('flip-tag.rcpk', flip(head + 4096 + 3), 'v7m-1', 'core', 'a tag changed');
bad('flip-last.rcpk', flip(good.length - 1), 'v7m-1', 'core', 'the last tag changed');
bad('flip-head.rcpk', flip(head - 2), 'v7m-1', 'core', 'the header changed');
bad('short.rcpk', good.subarray(0, good.length - 4096 - 16), 'v7m-1', 'core', 'the last chunk gone');
bad('long.rcpk', Buffer.concat([good, Buffer.alloc(1)]), 'v7m-1', 'core', 'a byte added');
const swapped = Buffer.from(good);
good.copy(swapped, head, head + 4112, head + 2 * 4112);
good.copy(swapped, head + 4112, head, head + 4112);
bad('swapped.rcpk', swapped, 'v7m-1', 'core', 'two chunks swapped');
bad('other-pack.rcpk', good, 'v7m-2', 'core', 'asked for another pack');
bad('other-part.rcpk', good, 'v7m-1', 'strict', 'asked for another part');
bad('other-key.rcpk', F.seal(F.packContainer(set()), crypto.randomBytes(32), { packId: 'v7m-1', part: 'core' }), 'v7m-1', 'core', 'another key');

// a damaged container under a good seal: the checks after the tags must catch it
function mutated(fn) {
  const c = Buffer.from(F.packContainer([{ name: 'words.rcwt', data: table }, { name: 'z', data: Buffer.from('tail') }]));
  fn(c);
  return F.seal(c, key, { packId: 'v7m-1', part: 'core' });
}
const nameEnd = (c) => c.indexOf('words.rcwt') + 'words.rcwt'.length;
bad('hash.rcpk', mutated((c) => { c[nameEnd(c) + 1 + 24 + 8 + 2] ^= 1; }), 'v7m-1', 'core', 'a blob against its sha256');
bad('codec.rcpk', mutated((c) => { c[nameEnd(c)] = 9; }), 'v7m-1', 'core', 'an unknown codec');
bad('version.rcpk', mutated((c) => { c.writeUInt32LE(1, 4); }), 'v7m-1', 'core', 'another container version');
bad('undersize.rcpk', mutated((c) => {
  const at = nameEnd(c) + 1 + 16;
  c.writeBigUInt64LE(c.readBigUInt64LE(at) - 1n, at);
  c.writeBigUInt64LE(c.readBigUInt64LE(at) , at + 8);
}), 'v7m-1', 'core', 'a blob longer than its size');
bad('room.rcpk', mutated((c) => { c.writeBigUInt64LE(1n, nameEnd(c) + 1 + 24); }), 'v7m-1', 'core', 'room under its size');
bad('deflate.rcpk', mutated((c) => { const t = c.indexOf(Buffer.from('tail')); c[t - 3] ^= 0x55; }), 'v7m-1', 'core', 'a damaged deflate stream');

for (const spec of process.argv.slice(3)) {
  const [part, list] = spec.split(':');
  const blobs = list.split(',').map((x) => {
    const [name, p] = x.split('=');
    return { name, data: fs.readFileSync(p) };
  });
  const w = blobs.find((b) => b.name === 'v7.weights.f16');
  if (w) w.room = JSON.parse(blobs.find((b) => b.name === 'v7.weights.json').data).fp32_bytes;
  ok(`real-${part}.rcpk`, blobs, 'v7m-real', part);
}
fs.writeFileSync(path.join(out, 'vectors.txt'), `${lines.join('\n')}\n`);
console.log(`${lines.length - 2} cases in ${out}`);
