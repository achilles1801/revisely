// Which recitation checker the app talks to: the one in its own Firebase project, since a checker accepts only that
// project's sign-ins and reads its Premium (entitlements/{uid}). Revisely Dev (revisely-dev) keeps the dev checker
// (us-east1); the store app (revision-buddy-3a398) the production one (europe-west1, Majd, Nov 17 2026; Recite checker
// server sets it up, dark until the release). Anything else (E2E's demo project, tests) gets the dev one.
import Constants from 'expo-constants';

export const PRODUCTION_PROJECT = 'revision-buddy-3a398';

export const CHECKERS = {
  dev: {
    base: 'https://recite-check-433792838929.us-east1.run.app',
    pair: 'https://recite-check-pair-433792838929.us-east1.run.app',
  },
  // Cloud Run's fixed address: <service>-<project number>.<region>.run.app (production is 169239488140).
  production: {
    base: 'https://recite-check-169239488140.europe-west1.run.app',
    pair: 'https://recite-check-pair-169239488140.europe-west1.run.app',
  },
} as const;

export type Checker = (typeof CHECKERS)[keyof typeof CHECKERS];

export function checkerFor(projectId: string | null | undefined): Checker {
  return projectId === PRODUCTION_PROJECT ? CHECKERS.production : CHECKERS.dev;
}

/** The app's Firebase project, as lib/firebase reads it (app config `extra.firebase.projectId`). */
function appProjectId(): string | undefined {
  const extra = (Constants.expoConfig?.extra ?? {}) as { firebase?: { projectId?: string } };
  return extra.firebase?.projectId;
}

/** This app's checker. */
export const checker = (): Checker => checkerFor(appProjectId());
