# expo-speech-recognition 3.1.3, vendored (Revisely Dev only)

The native code of [expo-speech-recognition](https://github.com/jamsch/expo-speech-recognition) 3.1.3 (the release for
Expo SDK 54; MIT, `LICENSE`), copied unchanged: `ios/`, `android/` and `app.plugin.js`. Only `package.json` and
`expo-module.config.json` are trimmed (no web, no JavaScript build).

It is here, not in package.json, so it is linked into Revisely Dev's builds alone (`plugins/withDevModules` puts
`modules-dev/` on autolinking's path; handbook/dev-stack.md, "Native code in Revisely Dev only") and the store app's
fingerprints don't move. The app loads it lazily (`src/lib/revo/dictation.ts`) for Revo's mic (BEHAVIOUR.md REVO-42).
The release-native change can replace this folder with the npm package.
