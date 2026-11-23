// How far a spot test goes (RECITE-8; Majd, Nov 23 2026: "how long they need to continue ... should be configurable for
// ex 1 page"). In pages of the mushaf. Three pages stay well inside a take's 15 minutes at a slow pace.

export const TEST_LENGTHS = [0.5, 1, 2, 3] as const;
export type TestLength = (typeof TEST_LENGTHS)[number];
export const DEFAULT_TEST_LENGTH: TestLength = 1;
