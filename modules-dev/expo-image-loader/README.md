# expo-image-loader (Revisely Dev only)

The native code of [expo-image-loader](https://github.com/expo/expo/tree/main/packages/expo-image-loader) 6.0.0 (Expo
SDK 54's version), MIT, by 650 Industries (Expo). `ios/` and `android/` are the npm package's own, unchanged; its
`expo-module.config.json` has no Android `publication`, so Gradle builds it from source.

`modules-dev/expo-image-picker` needs it on Android: a picked photo is compressed after it is read through the image
loader (Glide), and without it the picker fails ("Module 'ImageLoader' not found") whenever `quality` is below 1.

It is linked into Revisely Dev's builds alone (handbook/dev-stack.md, "Native code in Revisely Dev only"). The
release-native change can replace this folder with the npm package.
