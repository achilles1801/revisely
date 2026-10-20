const { getSentryExpoConfig } = require("@sentry/react-native/metro");

const config = getSentryExpoConfig(__dirname);

// src/data/quranWords.dat (recitation checking) is an asset, not bundled JS, so
// updates that don't change it don't download it again.
config.resolver.assetExts.push("dat");

module.exports = config;
