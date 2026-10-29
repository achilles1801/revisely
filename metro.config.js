const { getSentryExpoConfig } = require("@sentry/react-native/metro");

const config = getSentryExpoConfig(__dirname);

// src/data/quranWords.dat (hidden recite mode, word by word) is an asset, not
// bundled JS, so updates that don't change it don't download its 3 MB again.
config.resolver.assetExts.push("dat");

module.exports = config;
