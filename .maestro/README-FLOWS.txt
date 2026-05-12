Maestro E2E flows for Revisley
===============================

These YAML files describe end-to-end tests that drive a real install of the
app on a simulator/device.

Local run
---------
1. Install Maestro:                  curl -fsSL "https://get.maestro.mobile.dev" | bash
   (or via Homebrew:                 brew tap mobile-dev-inc/tap && brew install maestro)
2. Build a dev client:               eas build --profile development --platform ios
   then install it on a simulator.
3. Boot a simulator (iOS) or emulator (Android), launch nothing.
4. From repo root:                   npm run test:e2e:ios   (or test:e2e:android)

CI run
------
GitHub Actions invokes `maestro test .maestro/flows` after building the app
on a macOS runner. See .github/workflows/ci.yml.

Notes
-----
- Flows match elements by visible text. As the codebase adds `testID` props,
  prefer `id:` selectors over `text:` for stability.
- Flow 02 creates a real Firebase Auth user. To avoid polluting prod, point
  the app at the Firebase Auth emulator (FIREBASE_AUTH_EMULATOR_HOST=...)
  or use a dedicated test project.
