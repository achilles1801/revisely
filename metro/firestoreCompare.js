// Firestore's string comparator, made fast for Hermes at bundle time.
//
// Firestore orders strings (document paths, string values, map keys) by
// compareUtf8Strings, which reads both strings one `charAt` at a time. Every
// comparison of two page paths walks `users/<28-character uid>/pages/` that way,
// and Hermes makes a string for each `charAt`. Sign-up's 604 pages and an account
// deletion spend most of their seconds-long freezes there (profiled on the iOS
// Simulator, Nov 10 2026). Firestore 4.19.1 (firebase 13.2.0) still has it.
//
// The plugin swaps the function's body in Firestore's React Native build for
// fastCompareUtf8Strings below: the same order for every pair of strings
// (tests/scenarios/properties/firestoreCompare.property.ts checks it against the
// installed original), with equal strings answered at once and char codes in
// place of one-character strings. It runs from metro/babelTransformer.js, so it is
// JavaScript only: patches/ (patch-package) would change the native fingerprint.
'use strict';

const FUNCTION_NAME = '__PRIVATE_compareUtf8Strings';
// Firestore's React Native build, where the function is declared. Metro names files
// relative to the project ("node_modules/@firebase/…"), Node absolutely.
const FIRESTORE_RN_FILE = /(^|[\\/])node_modules[\\/]@firebase[\\/]firestore[\\/]dist[\\/][^\\/]+\.rn\.js$/;

/**
 * Strings in UTF-8 byte order, as Firestore's compareUtf8Strings. At the first
 * differing UTF-16 code unit: two non-surrogates or two surrogates compare by
 * value; otherwise the surrogate (part of a code point above U+FFFF, four bytes in
 * UTF-8) comes after. A string that is a prefix of the other comes first.
 */
function fastCompareUtf8Strings(left, right) {
  if (left === right) return 0;
  const length = Math.min(left.length, right.length);
  for (let i = 0; i < length; i++) {
    const a = left.charCodeAt(i);
    const b = right.charCodeAt(i);
    if (a !== b) {
      const aSurrogate = a >= 0xd800 && a <= 0xdfff;
      const bSurrogate = b >= 0xd800 && b <= 0xdfff;
      if (aSurrogate === bSurrogate) return a < b ? -1 : 1;
      return aSurrogate ? 1 : -1;
    }
  }
  return left.length < right.length ? -1 : left.length > right.length ? 1 : 0;
}

/** A Babel plugin: the declaration of FUNCTION_NAME gets fastCompareUtf8Strings' parameters and body. */
function firestoreComparePlugin({ template, types: t }) {
  const source = fastCompareUtf8Strings.toString();
  const replacement = template.statement.ast(`function ${FUNCTION_NAME}${source.slice(source.indexOf('('))}`);
  return {
    name: 'revisely-firestore-compare',
    visitor: {
      FunctionDeclaration(path, state) {
        if (!path.node.id || path.node.id.name !== FUNCTION_NAME) return;
        const fresh = t.cloneNode(replacement, true);
        path.node.params = fresh.params;
        path.node.body = fresh.body;
        // The rest of the file's transforms (the preset's) still run on the new body.
        state.file.metadata.firestoreCompareReplaced = (state.file.metadata.firestoreCompareReplaced || 0) + 1;
      },
    },
  };
}

module.exports = { FUNCTION_NAME, FIRESTORE_RN_FILE, fastCompareUtf8Strings, firestoreComparePlugin };
