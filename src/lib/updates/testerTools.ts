// Who sees the update tools in Settings (App info: the build, channel and
// update, Check for updates, Restart to update, test crashes): testers only.
// Everyone else gets updates by themselves (ota.ts) and sees just the version.
// Testers are a previewTester account, a TestFlight install (iOS; App Review
// installs the same way, and the tools are harmless to it) or a development build.

import { Platform } from 'react-native';
import InstallSource from '../../../modules/install-source';
import { isDevVariant } from '../variant';

export function showsUpdateTools(user: { previewTester?: boolean } | null | undefined): boolean {
  if (__DEV__ || isDevVariant()) return true;
  if (user?.previewTester === true) return true;
  if (Platform.OS !== 'ios') return false;
  try {
    return InstallSource?.isTestFlight() === true;
  } catch {
    return false;
  }
}
