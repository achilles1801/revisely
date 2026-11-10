// Metro's Babel transformer (Expo's), with metro/firestoreCompare.js added for
// Firestore's React Native build. metro.config.js points Metro here and passes the
// transformer it had in REVISELY_UPSTREAM_BABEL_TRANSFORMER.
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { FIRESTORE_RN_FILE, firestoreComparePlugin } = require('./firestoreCompare');

const upstreamPath = process.env.REVISELY_UPSTREAM_BABEL_TRANSFORMER;
if (!upstreamPath) throw new Error('metro/babelTransformer.js: REVISELY_UPSTREAM_BABEL_TRANSFORMER is not set (metro.config.js sets it)');
const upstream = require(upstreamPath);

function transform(args) {
  if (!FIRESTORE_RN_FILE.test(args.filename)) return upstream.transform(args);
  return upstream.transform({ ...args, plugins: [...(args.plugins || []), firestoreComparePlugin] });
}

// Metro's cache key covers this file but not what it requires: the plugin's own
// contents go in, so a change to it isn't served from Metro's cache.
function getCacheKey() {
  const own = crypto
    .createHash('sha1')
    .update(fs.readFileSync(path.join(__dirname, 'firestoreCompare.js')))
    .digest('hex');
  return [own, upstream.getCacheKey ? upstream.getCacheKey() : ''].join('$');
}

module.exports = { ...upstream, transform, getCacheKey };
