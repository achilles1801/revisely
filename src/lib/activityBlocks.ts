// Whether the Activity blocks show (ACT-2, ACT-3): every account since the November 2026 release (Majd, Nov 8
// 2026); preview testers only while they were built. With them come Insights in Activity (ACT-12: the tab
// bar is Home and Read), the day's + (ACT-5), the sittings' offers on a day (REC-3, MEM-5), the juz sheet
// (MEM-7) and pages logged by hand counting as revisions (ACT-16). Kept as a function so it can be gated
// again in one place, as lib/prayer/status's prayerTimesEnabled. Here, not in components/activity/DayBlocks
// (which re-exports it), so code that only asks needn't load the day view: "What's new" asks it to decide
// its Activity cards (components/whatsNew/needs).

export const activityBlocksEnabled = (user: { previewTester?: boolean } | null | undefined) => user != null;
