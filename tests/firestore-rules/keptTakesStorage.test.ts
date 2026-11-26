import { assertFails, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteObject, getBytes, listAll, ref, uploadBytes } from 'firebase/storage';
import { getTestEnv, cleanupTestEnv } from './setup';

// Takes kept by "Help improve mistake detection" (BEHAVIOUR.md RECITE-26): the checker writes recite-tests/<uid>/ with its
// own account, deleteUserAccount removes an account's, and the lab reads them with admin access. No client reaches them,
// not even the account whose takes they are: a phone that could write there could fill the training data with anything.
describe('kept takes in Storage (recite-tests)', () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => {
    env = await getTestEnv();
  });

  afterAll(async () => {
    await cleanupTestEnv();
  });

  it('no client reads, lists, writes or deletes them, their own account included', async () => {
    const path = 'recite-tests/alice/20261126-180000-a1b2c3.wav';
    await env.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage(), path), new Uint8Array([1, 2, 3]), { contentType: 'audio/wav' });
    });
    const clients = [
      env.authenticatedContext('alice').storage(),
      env.authenticatedContext('bob').storage(),
      env.unauthenticatedContext().storage(),
    ];
    for (const storage of clients) {
      await assertFails(getBytes(ref(storage, path)));
      await assertFails(listAll(ref(storage, 'recite-tests/alice')));
      await assertFails(
        uploadBytes(ref(storage, 'recite-tests/alice/20261126-180100-d4e5f6.wav'), new Uint8Array([1]), { contentType: 'audio/wav' }),
      );
      await assertFails(deleteObject(ref(storage, path)));
    }
  });
});
