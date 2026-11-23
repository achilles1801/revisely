import { assertFails, assertSucceeds, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { getBytes, ref, uploadBytes } from 'firebase/storage';
import { getTestEnv, cleanupTestEnv } from './setup';

// Revisely Dev's on-device bench (BEHAVIOUR.md ONDEV-1): its files on Storage (models/recite/) and the record a
// finished bench sends (onDeviceBench).

const ALICE = 'alice';

const record = (extra: Record<string, unknown> = {}) => ({
  createdAt: serverTimestamp(),
  platform: 'ios',
  device: { platform: 'ios', model: 'iPhone16,2', os: '26.1', cores: 6, memoryMb: 7900, thermal: 'nominal' },
  app: { version: '1.0.5', build: '40', runtime: 'abc', update: '' },
  windows: 60,
  runs: [{ model: 'v7-live-fp32', provider: 'cpu', threads: 2, ok: true, runMs: '41.2,40.8', featureMs: '6.1,6.0' }],
  ...extra,
});

describe('on-device bench: onDeviceBench and models/recite/', () => {
  let env: RulesTestEnvironment;
  beforeAll(async () => {
    env = await getTestEnv();
  });
  afterEach(async () => {
    await env.clearFirestore();
  });
  afterAll(async () => {
    await cleanupTestEnv();
  });

  it('a signed-in phone sends a record; nobody reads, changes or deletes one from a client', async () => {
    const db = env.authenticatedContext(ALICE).firestore();
    const sent = await assertSucceeds(addDoc(collection(db, 'onDeviceBench'), record()));
    await assertFails(getDoc(sent));
    await assertFails(getDocs(collection(db, 'onDeviceBench')));
    await assertFails(updateDoc(sent, { windows: 20 }));
    await assertFails(deleteDoc(sent));
    await assertFails(addDoc(collection(env.unauthenticatedContext().firestore(), 'onDeviceBench'), record()));
  });

  it('only the bench’s fields, in their shapes', async () => {
    const db = env.authenticatedContext(ALICE).firestore();
    await assertFails(addDoc(collection(db, 'onDeviceBench'), record({ uid: ALICE })));
    await assertFails(addDoc(collection(db, 'onDeviceBench'), record({ platform: 'web' })));
    await assertFails(addDoc(collection(db, 'onDeviceBench'), record({ createdAt: new Date(0) })));
    await assertFails(addDoc(collection(db, 'onDeviceBench'), record({ windows: 0 })));
    await assertFails(addDoc(collection(db, 'onDeviceBench'), record({ runs: [] })));
    await assertFails(addDoc(collection(db, 'onDeviceBench'), record({ runs: 'many' })));
    await assertFails(addDoc(collection(db, 'onDeviceBench'), record({ device: 'iPhone' })));
    const { runs: _runs, ...noRuns } = record();
    await assertFails(addDoc(collection(db, 'onDeviceBench'), noRuns));
    await assertFails(setDoc(doc(db, 'onDeviceBench', 'x'), { ...record(), runs: Array.from({ length: 41 }, () => ({})) }));
  });

  it('the model and the bench’s files: read when signed in, written only by the admin SDK', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage(), 'models/recite/v7/v7-live-int8.onnx'), new Uint8Array([1, 2, 3]));
    });
    await assertSucceeds(getBytes(ref(env.authenticatedContext(ALICE).storage(), 'models/recite/v7/v7-live-int8.onnx')));
    await assertFails(getBytes(ref(env.unauthenticatedContext().storage(), 'models/recite/v7/v7-live-int8.onnx')));
    await assertFails(
      uploadBytes(ref(env.authenticatedContext(ALICE).storage(), 'models/recite/v7/v7-live-int8.onnx'), new Uint8Array([9])),
    );
    await assertFails(uploadBytes(ref(env.authenticatedContext(ALICE).storage(), 'models/recite/bench.json'), new Uint8Array([9])));
  });
});
