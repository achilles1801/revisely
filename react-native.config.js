// Word-by-word recite mode is iPhone-only (src/components/recite/useReciteFollow),
// so Android builds leave whisper.rn's native code (whisper.cpp) out.
module.exports = {
  dependencies: {
    'whisper.rn': { platforms: { android: null } },
  },
};
