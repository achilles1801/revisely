/**
 * Hidden recite mode (#110) is for preview testers for now. It has its own gate,
 * apart from prayer times': those go public in 1.0.3, and recite mode doesn't.
 */
export const reciteModeEnabled = (user: { previewTester?: boolean } | null | undefined) => user?.previewTester === true;
