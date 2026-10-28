// The Home and Lock Screen widgets (WidgetKit, SwiftUI), linked into the
// generated Xcode project by @bacons/apple-targets on prebuild. Everything in this
// folder is the target: Swift sources, Assets.xcassets, verses.json, the font.
// The app writes what they show to the App Group (src/lib/widgets).
//
// Prebuild writes only widget.entitlements here, from `entitlements` below, and it
// is committed exactly as written, so the folder (which the fingerprint counts,
// fingerprint.config.js) hashes the same on every machine. No `colors` or `images`:
// Assets.xcassets is kept by hand.
/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'widget',
  name: 'ReviselyWidget',
  displayName: 'Revisely',
  bundleIdentifier: '.widget',
  // Lock Screen widgets need 16; containerBackground and tinting are used where available.
  deploymentTarget: '16.0',
  entitlements: {
    // The app's App Group (app.config.js ios.entitlements).
    'com.apple.security.application-groups': config.ios.entitlements['com.apple.security.application-groups'],
  },
});
