// First: development-only switches that must be in place before Firebase starts.
import './src/dev/install';
import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately.
// E2E builds (EXPO_PUBLIC_E2E=1) wrap it to apply a launch link's test clock
// first; every other build drops the branch (src/dev/install).
registerRootComponent(
  process.env.EXPO_PUBLIC_E2E === '1' ? require('./src/lib/e2e/E2ERoot').withE2E(App) : App,
);
