# expo-image-picker (Revisely Dev only)

The native code of [expo-image-picker](https://docs.expo.dev/versions/latest/sdk/imagepicker/) 17.0.11 (Expo SDK
54's version), MIT, by 650 Industries (Expo). It is here for the account picture, so people can choose or take a photo
(Majd, Nov 26 2026). `ios/` and `android/` are the npm package's own, unchanged.

Trimmed:
- no web and no JavaScript build: the app calls the native module (`ExponentImagePicker`) itself, loaded lazily behind
  `isDevVariant()`;
- `expo-module.config.json` has no Android `publication`, so Gradle builds it from source, as the other modules here;
- `app.plugin.js` writes iPhone's photo library and camera texts only (images, never video; see the file).

It needs `modules-dev/expo-image-loader` on Android (the module's compression reads images through it).

It is here, not in package.json, so it is linked into Revisely Dev's builds alone (`plugins/withDevModules` puts
`modules-dev/` on autolinking's path; handbook/dev-stack.md, "Native code in Revisely Dev only") and the store app's
fingerprints don't move. The release-native change can replace this folder with the npm package.
