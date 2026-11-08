// Whether the Activity blocks show (the preview testers, while they are built; ACT-2, ACT-3). Here,
// not in components/activity/DayBlocks (which re-exports it), so code that only asks needn't load the
// day view: "What's new" asks it to decide its Activity cards (components/whatsNew/needs).

export const activityBlocksEnabled = (user: { previewTester?: boolean } | null | undefined) => user?.previewTester === true;
