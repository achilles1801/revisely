// What the visual check crops, masks and leaves out (lib.mjs, .maestro/README.md).
// Coordinates are the raw capture's pixels: iOS is an iPhone 17 Pro at 3× (1206×2622),
// Android a pixel_6 profile at 2.625× (1080×2400). A negative y counts from the bottom.

export const PLATFORMS = {
  ios: {
    // The status bar (62 pt): the Simulator's own clock and battery.
    top: 186,
    scale: 2,
    masks: [
      // The E2E status line (src/lib/e2e/E2ERoot.tsx: 1 pt from the bottom, 9 pt type):
      // its clock moves on with real time.
      { x: 0, y: -48, w: 1206, h: 48, why: 'E2E status line' },
    ],
  },
  android: {
    // The status bar: the emulator's clock and icons.
    top: 120,
    scale: 2,
    masks: [
      // The E2E status line's time (32 dp from the bottom, over the tab bar): only "HH:MM",
      // so the tab under it is still compared. Roboto's digits are all one width, so the
      // zone after it doesn't move.
      { x: 176, y: 2285, w: 68, h: 34, why: 'E2E status line clock' },
    ],
  },
};

// Per screen and platform: what still varies between runs on that screen. A screen whose
// layout moves needs its masks moved too: the boards show masked areas in pink.

// A session's minutes in Home's "Recent sessions" row ("Pages 1 and 582–590 · 2 min · …"):
// real time spent in the session. From the minutes to the end of the line (the rest is cut
// short to fit after them). `ios`/`android`: the top of that line on the screen.
const sessionMinutes = (ios, android) => ({
  ios: [{ x: 684, y: ios - 6, w: 522, h: 52, why: 'session minutes' }],
  android: [{ x: 592, y: android - 6, w: 488, h: 50, why: 'session minutes' }],
});

// Revo's button (bottom right, over Home): Revo is being rebuilt. Unmask it when Revo's
// baselines are approved.
const revoButton = {
  ios: [{ x: 940, y: 2110, w: 266, h: 256, why: "Revo's button" }],
  android: [{ x: 872, y: 1990, w: 208, h: 240, why: "Revo's button" }],
};

const merge = (...sets) => ({
  ios: sets.flatMap((s) => s.ios ?? []),
  android: sets.flatMap((s) => s.android ?? []),
});

export const SCREEN_MASKS = {
  '01-home-day-one': merge(revoButton),
  '02-home-continue': merge(revoButton, sessionMinutes(1194, 1012)),
  '02-home-done': merge(revoButton, sessionMinutes(1272, 1081)),
  '03-home-tomorrow': merge(revoButton, sessionMinutes(1272, 1081)),
  '04-home-done': merge(revoButton, sessionMinutes(1392, 1186), {
    // The next prayer's countdown ("in 2h 15m"), right-aligned before its chevron.
    ios: [{ x: 880, y: 360, w: 242, h: 60, why: 'prayer countdown' }],
    android: [{ x: 800, y: 279, w: 205, h: 53, why: 'prayer countdown' }],
  }),
  '05-daily-log-notes': {
    // Each note's time ("8:02pm"): when the flow typed it.
    ios: [
      { x: 320, y: 386, w: 220, h: 48, why: 'note time' },
      { x: 320, y: 608, w: 220, h: 48, why: 'note time' },
    ],
    android: [
      { x: 276, y: 302, w: 184, h: 44, why: 'note time' },
      { x: 276, y: 497, w: 184, h: 44, why: 'note time' },
    ],
  },
  '06-home-offline': merge(revoButton, sessionMinutes(1272, 1186)),
  '08-home-kathmandu': merge(revoButton),
};

// Screens left without a baseline on purpose: being redesigned now. Their captures are
// reported, never failed, and `approve` skips them unless named. Approve them once their
// boards match the approved mocks, then take them out of here.
export const PENDING = [
  {
    pattern: /activity/i,
    reason: 'Activity (Overview, Day, Insights) is being rebuilt',
  },
  {
    pattern: /smart-preview/i,
    reason: 'Insights (Smart Tracking) is being merged into Activity',
  },
  {
    pattern: /^(r\d+|09-)/i,
    reason: 'Revo is being rebuilt',
  },
];

// pixelmatch's colour distance per pixel (0–1), and how many changed pixels (of a
// normalised, halved capture) still count as the same screen.
export const MATCH = { threshold: 0.1, maxPixels: 12 };
