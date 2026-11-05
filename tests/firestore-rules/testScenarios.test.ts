// Load test scenario (functions/src/testScenarios.ts) writes with the Admin SDK,
// which the rules don't check. So each scenario's documents are written here as
// the user, through the rules: every one must be a document the app itself
// could write (the same shapes, within the same limits).
import { assertSucceeds, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, serverTimestamp, setDoc, Timestamp, updateDoc } from 'firebase/firestore';
import { getTestEnv, cleanupTestEnv } from './setup';
import {
  SCENARIO_IDS,
  ScenarioId,
  SeedContext,
  addDays,
  buildScenario,
  calendarDay,
  scenarioDocuments,
  wallMs,
} from '../../functions/src/testScenarios';
import { freshUser } from '../../functions/src/testerReset';

const ALICE = 'alice';
const ZONE = 'America/Chicago';
const NOW = wallMs('2026-11-05', 12, 0, ZONE);

function context(scenario: ScenarioId): SeedContext {
  if (scenario !== 'fajr-edge') return { zone: ZONE, now: NOW, fajr: null };
  const today = calendarDay(NOW, ZONE);
  const days: Record<string, number> = {};
  for (let k = -3; k <= 1; k++) days[addDays(today, k)] = wallMs(addDays(today, k), 5, 40, ZONE);
  return { zone: ZONE, now: NOW, fajr: { coords: { latitude: 41.88, longitude: -87.63 }, method: 'NorthAmerica', days } };
}

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await getTestEnv();
});

afterAll(async () => {
  await cleanupTestEnv();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

describe('every test scenario is made of documents the app itself could write', () => {
  it.each(SCENARIO_IDS.map((s) => [s]))('%s', async (scenario) => {
    const plan = buildScenario(scenario, context(scenario), ALICE);
    const db = testEnv.authenticatedContext(ALICE).firestore();

    // The user document: sign-up's (as the app creates it; the admin-only fields
    // left out), then the scenario's fields as an update the app could make.
    const fresh = freshUser({ uid: ALICE, email: 'alice@example.com' }, serverTimestamp(), new Date(NOW).toISOString());
    const { previewTester: _p, dataResetAt: _d, ...signUp } = fresh;
    await assertSucceeds(setDoc(doc(db, 'users', ALICE), signUp));
    await assertSucceeds(updateDoc(doc(db, 'users', ALICE), { ...plan.user, updatedAt: serverTimestamp() }));

    const docs = scenarioDocuments(plan, (ms) => Timestamp.fromMillis(ms), serverTimestamp());
    expect(docs.length).toBeGreaterThan(0);
    for (let i = 0; i < docs.length; i += 50) {
      await Promise.all(
        docs.slice(i, i + 50).map(({ path, data }) =>
          assertSucceeds(setDoc(doc(db, `users/${ALICE}/${path}`), data)).catch((err) => {
            throw new Error(`${scenario}: ${path} was refused: ${(err as Error).message}`);
          }),
        ),
      );
    }
  }, 120_000);
});
