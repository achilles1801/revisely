import * as fs from 'fs';
import * as path from 'path';
import {
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';

const PROJECT_ID = 'revisley-rules-test';
const RULES_PATH = path.resolve(__dirname, '../../firestore.rules');
const STORAGE_RULES_PATH = path.resolve(__dirname, '../../storage.rules');

let testEnv: RulesTestEnvironment | undefined;

export async function getTestEnv(): Promise<RulesTestEnvironment> {
  if (!testEnv) {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: fs.readFileSync(RULES_PATH, 'utf8'),
        host: '127.0.0.1',
        port: 8080,
      },
      storage: {
        rules: fs.readFileSync(STORAGE_RULES_PATH, 'utf8'),
        host: '127.0.0.1',
        port: 9199,
      },
    });
  }
  return testEnv;
}

export async function cleanupTestEnv(): Promise<void> {
  if (testEnv) {
    await testEnv.cleanup();
    testEnv = undefined;
  }
}
