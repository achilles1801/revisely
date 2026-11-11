const { getSentryExpoConfig } = require("@sentry/react-native/metro");

const config = getSentryExpoConfig(__dirname);

// src/data/quranWords.dat (hidden recite mode, word by word) is an asset, not
// bundled JS, so updates that don't change it don't download its 3 MB again.
config.resolver.assetExts.push("dat");

// Firestore's string comparator, made fast for Hermes as the bundle is built
// (metro/firestoreCompare.js). JavaScript only: the native fingerprint stays.
process.env.REVISELY_UPSTREAM_BABEL_TRANSFORMER = config.transformer.babelTransformerPath;
config.transformer.babelTransformerPath = require.resolve("./metro/babelTransformer");

module.exports = config;
