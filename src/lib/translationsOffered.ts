// Who chooses from every QuranEnc translation (TRANS-5 to TRANS-8): every account since the November 2026
// release (Majd, Nov 8 2026); testers only before, when everyone else had Saheeh International and The
// Clear Quran®. Kept as a function so it can be gated again in one place. Apart from lib/translation (which
// loads the file system and a native module), so "What's new" can ask it (components/whatsNew/needs).

export const everyTranslationOffered = (user: { previewTester?: boolean } | null | undefined) => user != null;
