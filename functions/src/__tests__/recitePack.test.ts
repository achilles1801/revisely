import { constants, generateKeyPairSync, privateDecrypt, randomBytes } from 'crypto';
import {
  contentPackId,
  DEFAULT_CHUNK,
  open,
  PACK_ID,
  packContainer,
  PackFormatError,
  readHeader,
  seal,
  sealedSize,
  TAG_BYTES,
  unpackContainer,
} from '../recitePack/format';
import {
  claimPack,
  DEFAULT_DAILY_CALLS,
  handleRecitePack,
  PackCaller,
  PackDeps,
  PackError,
  PackLimits,
  parseConfig,
  parseInput,
  URL_TTL_MS,
} from '../recitePack/handler';

const KEY = Buffer.alloc(32, 7);
const blobs = () => [
  { name: 'v7.weights.f16', data: randomBytes(5000) },
  { name: 'words.rcwt', data: randomBytes(3000) },
  { name: 'config.json', data: Buffer.from('{"vocab":["a"]}') },
];

describe('the .rcpk format', () => {
  it('seals and opens a container, every blob back as it was', () => {
    const b = blobs();
    const file = seal(packContainer(b), KEY, { packId: 'v7m-1', part: 'core', chunk: 1024 });
    const back = unpackContainer(open(file, KEY, { packId: 'v7m-1', part: 'core' }));
    expect(back.map((x) => x.name)).toEqual(b.map((x) => x.name));
    back.forEach((x, i) => expect(x.data.equals(b[i].data)).toBe(true));
    expect(file.length).toBe(sealedSize(readHeader(file).header));
  });

  it('holds no plaintext: a blob’s bytes appear nowhere in the file', () => {
    const marker = Buffer.from('THE-MODEL-WEIGHTS-'.repeat(20));
    const file = seal(packContainer([{ name: 'v7.weights.f16', data: marker }]), KEY, { packId: 'v7m-1', part: 'core' });
    expect(file.includes(marker.subarray(0, 32))).toBe(false);
    expect(file.includes(Buffer.from('v7.weights.f16'))).toBe(false); // the blob table is sealed too
  });

  it('a fresh nonce for every seal, so the same pack sealed twice differs', () => {
    const plain = packContainer(blobs());
    const a = seal(plain, KEY, { packId: 'v7m-1', part: 'core' });
    const b = seal(plain, KEY, { packId: 'v7m-1', part: 'core' });
    expect(a.equals(b)).toBe(false);
  });

  it('an empty container still carries one chunk with a tag', () => {
    const file = seal(Buffer.alloc(0), KEY, { packId: 'p', part: 'strict' });
    expect(file.length).toBe(readHeader(file).length + TAG_BYTES);
    expect(open(file, KEY).length).toBe(0);
  });

  describe('refuses a part that was changed', () => {
    const plain = packContainer(blobs());
    const file = seal(plain, KEY, { packId: 'v7m-1', part: 'core', chunk: 2048 });
    const headLen = readHeader(file).length;

    it('a flipped bit in any chunk', () => {
      for (const at of [headLen + 1, headLen + 2048 + TAG_BYTES + 5, file.length - 1]) {
        const bad = Buffer.from(file);
        bad[at] ^= 1;
        expect(() => open(bad, KEY)).toThrow(PackFormatError);
      }
    });

    it('a changed header (it is in every chunk’s AAD)', () => {
      const bad = Buffer.from(file);
      bad[headLen - 1] ^= 1; // the nonce prefix's last byte
      expect(() => open(bad, KEY)).toThrow(PackFormatError);
    });

    it('two chunks swapped', () => {
      const c = 2048 + TAG_BYTES;
      const bad = Buffer.concat([file.subarray(0, headLen), file.subarray(headLen + c, headLen + 2 * c), file.subarray(headLen, headLen + c), file.subarray(headLen + 2 * c)]);
      expect(() => open(bad, KEY)).toThrow(PackFormatError);
    });

    it('cut short, or with bytes added', () => {
      expect(() => open(file.subarray(0, file.length - 1), KEY)).toThrow('wrong length');
      expect(() => open(Buffer.concat([file, Buffer.alloc(1)]), KEY)).toThrow('wrong length');
    });

    it('the wrong key', () => {
      expect(() => open(file, Buffer.alloc(32, 8))).toThrow(PackFormatError);
    });

    it('another pack or another part, even with the right key', () => {
      expect(() => open(file, KEY, { packId: 'v7m-2' })).toThrow('another pack');
      expect(() => open(file, KEY, { part: 'strict' })).toThrow('another part');
    });
  });

  it('a container whose blob was changed fails its sha256', () => {
    const c = packContainer(blobs());
    c[c.length - 1] ^= 1;
    expect(() => unpackContainer(c)).toThrow('sha256');
  });

  it('deflates a blob that shrinks, keeps one that doesn’t, and reads both back', () => {
    const table = Buffer.from('the same words again and again '.repeat(2000));
    const weights = randomBytes(40_000);
    const c = packContainer([{ name: 'words.rcwt', data: table }, { name: 'v7.weights.f16', data: weights }]);
    expect(c.length).toBeLessThan(weights.length + table.length / 10);
    expect(c.includes(weights)).toBe(true); // stored whole, so a phone can decrypt it straight into the engine's buffer
    const back = unpackContainer(c);
    expect(back[0].data.equals(table)).toBe(true);
    expect(back[1].data.equals(weights)).toBe(true);
  });

  it('refuses a deflated blob that is damaged or would inflate past its size', () => {
    const data = Buffer.from('abcabcabc'.repeat(1000));
    const c = packContainer([{ name: 'words.rcwt', data }]);
    const nameAt = c.indexOf('words.rcwt');
    const sizeAt = nameAt + 'words.rcwt'.length + 1 + 8 + 8; // name, codec, offset, stored
    const smaller = Buffer.from(c);
    smaller.writeBigUInt64LE(BigInt(data.length - 1), sizeAt);
    expect(() => unpackContainer(smaller)).toThrow(PackFormatError);
    const damaged = Buffer.from(c);
    damaged[damaged.length - 2] ^= 0xff;
    expect(() => unpackContainer(damaged)).toThrow(PackFormatError);
  });

  it('keeps the room a blob needs on the phone, and refuses less than its data', () => {
    const data = randomBytes(1000);
    const [back] = unpackContainer(packContainer([{ name: 'v7.weights.f16', data, room: 2020 }]));
    expect(back.room).toBe(2020);
    expect(back.data.equals(data)).toBe(true);
    expect(unpackContainer(packContainer([{ name: 'x', data }]))[0].room).toBe(1000);
    expect(() => packContainer([{ name: 'x', data, room: 999 }])).toThrow('room');
  });

  it('refuses a container of another version or an unknown codec', () => {
    const c = packContainer([{ name: 'a', data: Buffer.from('x') }]);
    const version = Buffer.from(c);
    version.writeUInt32LE(1, 4);
    expect(() => unpackContainer(version)).toThrow('version');
    const codec = Buffer.from(c);
    codec[c.indexOf('a', 12) + 1] = 9;
    expect(() => unpackContainer(codec)).toThrow('codec');
  });

  it('refuses repeated or empty blob names and bad pack ids', () => {
    expect(() => packContainer([{ name: 'a', data: Buffer.alloc(1) }, { name: 'a', data: Buffer.alloc(1) }])).toThrow();
    expect(() => packContainer([{ name: '', data: Buffer.alloc(1) }])).toThrow();
    expect(() => seal(Buffer.alloc(1), KEY, { packId: 'Bad Id', part: 'core' })).toThrow('pack id');
  });

  it('a pack’s id follows its files: any hash, name or part changing makes a new one, their order doesn’t', () => {
    const files = [
      { part: 'core', name: 'config.json', sha256: 'a'.repeat(64) },
      { part: 'core', name: 'words.rcwt', sha256: 'b'.repeat(64) },
      { part: 'strict', name: 'v5.onnx', sha256: 'c'.repeat(64) },
    ];
    const id = contentPackId(files);
    expect(id).toMatch(/^v7m-[0-9a-f]{12}$/);
    expect(PACK_ID.test(id)).toBe(true);
    expect(contentPackId([...files].reverse())).toBe(id);
    expect(contentPackId([{ ...files[0], sha256: 'd'.repeat(64) }, files[1], files[2]])).not.toBe(id);
    expect(contentPackId([{ ...files[0], name: 'other' }, files[1], files[2]])).not.toBe(id);
    expect(contentPackId([{ ...files[2], part: 'core' }, files[0], files[1]])).not.toBe(id);
    expect(contentPackId(files.slice(0, 2))).not.toBe(id);
  });

  it('a megabyte chunk by default', () => {
    const file = seal(Buffer.alloc(10), KEY, { packId: 'p', part: 'core' });
    expect(readHeader(file).header.chunk).toBe(DEFAULT_CHUNK);
  });
});

// The device keys the phone's module makes: RSA-2048, sent as SPKI (Android) or PKCS#1 (iOS).
const device = generateKeyPairSync('rsa', { modulusLength: 2048 });
const spki = device.publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
const pkcs1 = device.publicKey.export({ format: 'der', type: 'pkcs1' }).toString('base64');
const unwrap = (b64: string) =>
  privateDecrypt({ key: device.privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha1' }, Buffer.from(b64, 'base64'));

const PACK_KEY = randomBytes(32);
const SHA = 'a'.repeat(64);
const CONFIG = {
  packId: 'v7m-1',
  format: 1,
  parts: {
    core: { path: 'packs/recite/v7m-1/core.rcpk', bytes: 47_000_000, sha256: SHA },
    strict: { path: 'packs/recite/v7m-1/strict.rcpk', bytes: 23_000_000, sha256: SHA },
  },
  apps: ['1:433:ios:dev', '1:433:android:dev'],
  claim: 'onDeviceBench',
  dailyCalls: 6,
  dailyKeys: 3,
};
const NOW = Date.UTC(2026, 10, 23, 12);

function fakeDeps(over: Partial<PackDeps> & { store?: Map<string, PackLimits> } = {}): PackDeps & { store: Map<string, PackLimits> } {
  const store = over.store ?? new Map<string, PackLimits>();
  return {
    store,
    now: () => NOW,
    config: async () => CONFIG,
    key: async () => PACK_KEY,
    limits: async (uid, update) => {
      const { next, refused } = update(store.get(uid) ?? null);
      store.set(uid, next);
      return refused;
    },
    signedUrl: async (path, exp) => `https://signed.example/${path}?exp=${exp}`,
    ...over,
  };
}

const caller = (over: Partial<PackCaller> = {}): PackCaller => ({
  auth: { uid: 'alice', token: { onDeviceBench: true } },
  app: { appId: '1:433:ios:dev' },
  data: { publicKey: spki, keyFormat: 'spki' },
  ...over,
});

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return e instanceof PackError ? e.code : `other: ${(e as Error).message}`;
  }
};

describe('recitePack', () => {
  it('answers signed URLs for every part and the pack key, readable only with the device’s private key', async () => {
    const a = await handleRecitePack(caller(), fakeDeps());
    expect(a.packId).toBe('v7m-1');
    expect(a.parts.map((p) => p.part)).toEqual(['core', 'strict']);
    expect(a.parts[0]).toEqual({ part: 'core', url: `https://signed.example/packs/recite/v7m-1/core.rcpk?exp=${NOW + URL_TTL_MS}`, bytes: 47_000_000, sha256: SHA });
    expect(a.expiresAt).toBe(NOW + URL_TTL_MS);
    expect(a.wrappedKey).not.toContain(PACK_KEY.toString('base64'));
    expect(unwrap(a.wrappedKey).equals(PACK_KEY)).toBe(true);
  });

  it('takes the iOS Keychain’s PKCS#1 form of the same key', async () => {
    const a = await handleRecitePack(caller({ data: { publicKey: pkcs1, keyFormat: 'pkcs1' } }), fakeDeps());
    expect(unwrap(a.wrappedKey).equals(PACK_KEY)).toBe(true);
  });

  it('only the parts asked for', async () => {
    const a = await handleRecitePack(caller({ data: { publicKey: spki, keyFormat: 'spki', parts: ['core'] } }), fakeDeps());
    expect(a.parts.map((p) => p.part)).toEqual(['core']);
  });

  it('refuses without a sign-in, from another app, or without the pack’s claim', async () => {
    expect(await code(handleRecitePack(caller({ auth: null }), fakeDeps()))).toBe('unauthenticated');
    expect(await code(handleRecitePack(caller({ app: null }), fakeDeps()))).toBe('permission-denied');
    expect(await code(handleRecitePack(caller({ app: { appId: '1:433:web:dev' } }), fakeDeps()))).toBe('permission-denied');
    expect(await code(handleRecitePack(caller({ auth: { uid: 'bob', token: {} } }), fakeDeps()))).toBe('permission-denied');
  });

  it('refuses where there is no pack: production', async () => {
    expect(await code(handleRecitePack(caller(), fakeDeps({ config: async () => null })))).toBe('failed-precondition');
    expect(await code(handleRecitePack(caller(), fakeDeps({ config: async () => ({ ...CONFIG, packId: 'NO' }) })))).toBe('failed-precondition');
  });

  it('refuses a key that isn’t RSA-2048, without counting it', async () => {
    const small = generateKeyPairSync('rsa', { modulusLength: 1024 }).publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
    const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' }).publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
    const deps = fakeDeps();
    for (const data of [{ publicKey: small, keyFormat: 'spki' }, { publicKey: ec, keyFormat: 'spki' }, { publicKey: 'AAAA'.repeat(40), keyFormat: 'spki' }, { publicKey: spki, keyFormat: 'jwk' }, { publicKey: spki, keyFormat: 'spki', parts: ['all'] }]) {
      expect(await code(handleRecitePack(caller({ data }), deps))).toBe('invalid-argument');
    }
    expect(deps.store.size).toBe(0);
  });

  it('six calls a day, then refused until the next UTC day', async () => {
    const deps = fakeDeps();
    for (let i = 0; i < DEFAULT_DAILY_CALLS; i++) expect(await code(handleRecitePack(caller(), deps))).toBe('ok');
    expect(await code(handleRecitePack(caller(), deps))).toBe('resource-exhausted');
    const tomorrow = fakeDeps({ store: deps.store, now: () => NOW + 24 * 3600_000 });
    expect(await code(handleRecitePack(caller(), tomorrow))).toBe('ok');
  });

  it('three device keys a day; a key seen today is no new key', async () => {
    const deps = fakeDeps();
    const keys = [0, 1, 2, 3].map(() => generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ format: 'der', type: 'spki' }).toString('base64'));
    for (const k of keys.slice(0, 3)) expect(await code(handleRecitePack(caller({ data: { publicKey: k, keyFormat: 'spki' } }), deps))).toBe('ok');
    expect(await code(handleRecitePack(caller({ data: { publicKey: keys[3], keyFormat: 'spki' } }), deps))).toBe('resource-exhausted');
    expect(await code(handleRecitePack(caller({ data: { publicKey: keys[0], keyFormat: 'spki' } }), deps))).toBe('ok');
  });

  it('a pack without its key is an internal error, not a key-less answer', async () => {
    expect(await code(handleRecitePack(caller(), fakeDeps({ key: async () => null })))).toBe('internal');
  });
});

describe('claimPack', () => {
  const L = { dailyCalls: 2, dailyKeys: 1 };
  it('a refused call still counts, so retrying doesn’t lift it', () => {
    let s = claimPack(null, 'd', 'k1', L).next;
    s = claimPack(s, 'd', 'k1', L).next;
    const r = claimPack(s, 'd', 'k1', L);
    expect(r.refused).toBe('calls');
    expect(r.next.calls).toBe(3);
  });
  it('a new day starts from nothing', () => {
    const r = claimPack({ day: 'old', calls: 99, keys: ['a', 'b'] }, 'new', 'c', L);
    expect(r).toEqual({ next: { day: 'new', calls: 1, keys: ['c'] }, refused: null });
  });
});

describe('parseConfig and parseInput', () => {
  it('a part outside the pack’s own folder, or no core part, means no pack', () => {
    expect(parseConfig({ ...CONFIG, parts: { core: { ...CONFIG.parts.core, path: 'models/recite/v7.onnx' } } })).toBeNull();
    expect(parseConfig({ ...CONFIG, parts: { strict: CONFIG.parts.strict } })).toBeNull();
    expect(parseConfig({ ...CONFIG, apps: 'all' })).toBeNull();
  });
  it('limits default when missing and stay within 1–100', () => {
    const c = parseConfig({ ...CONFIG, dailyCalls: undefined, dailyKeys: 1000 })!;
    expect(c.dailyCalls).toBe(6);
    expect(c.dailyKeys).toBe(3);
  });
  it('the key id is the same for both forms of one key', () => {
    expect(parseInput({ publicKey: spki, keyFormat: 'spki' }).keyId).toBe(parseInput({ publicKey: pkcs1, keyFormat: 'pkcs1' }).keyId);
  });
});
