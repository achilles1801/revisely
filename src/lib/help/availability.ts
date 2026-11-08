// Who gets the help buttons: previewTester accounts for now (testers first, as every new feature).
// When help goes to everyone with the release, this is the one place that changes.

import type { User } from '../../types';

export function helpAvailable(user: Pick<User, 'previewTester'> | null | undefined): boolean {
  return user?.previewTester === true;
}
