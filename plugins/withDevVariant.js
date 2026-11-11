// Revisely Dev only (app.config.js loads this plugin only with APP_VARIANT=dev; CLAUDE.md "Dev stack").
//
// The widget extension's Swift code names the store app's App Group and its revisely:// links
// (targets/widget). Changing those files would move both production fingerprints (targets/ is one of
// their sources), so the Dev build rewrites them in the copy it builds from instead: its widgets then
// read Revisely Dev's App Group and open Revisely Dev, not the store app beside it.
//
// The release workflows build from a copy of the repository (`eas build --local`), so the tracked files
// stay as they are. `APP_VARIANT=dev npx expo prebuild` on a laptop rewrites them in place: put them
// back with `git checkout targets/`.
//
// The lasting fix (the widget works out its App Group and scheme from its own bundle id) rides the next
// native release; this plugin can go then.
const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

const STORE_GROUP = 'group.com.revisionbuddy.app';
const STORE_SCHEME = 'revisely://';

/** The widget's Swift sources with the Dev app's App Group and scheme. Throws if the group isn't there. */
function devWidgetSources(files, { appGroup, scheme }) {
  const groupLine = `let appGroup = "${STORE_GROUP}"`;
  if (!Object.values(files).some((text) => text.includes(groupLine))) {
    throw new Error(`withDevVariant: no \`${groupLine}\` in targets/widget. Update plugins/withDevVariant.js to match.`);
  }
  const out = {};
  for (const [name, text] of Object.entries(files)) {
    out[name] = text
      .split(groupLine).join(`let appGroup = "${appGroup}"`)
      .split(`"${STORE_SCHEME}`).join(`"${scheme}://`);
  }
  return out;
}

function withDevVariant(config) {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const bundleId = cfg.ios && cfg.ios.bundleIdentifier;
      if (!bundleId || !bundleId.endsWith('.dev')) {
        throw new Error(`withDevVariant is for Revisely Dev only (bundle id ${bundleId}).`);
      }
      const appGroup = cfg.ios.entitlements['com.apple.security.application-groups'][0];
      const dir = path.join(cfg.modRequest.projectRoot, 'targets', 'widget');
      const names = fs.readdirSync(dir).filter((f) => f.endsWith('.swift'));
      const files = Object.fromEntries(names.map((f) => [f, fs.readFileSync(path.join(dir, f), 'utf8')]));
      const rewritten = devWidgetSources(files, { appGroup, scheme: cfg.scheme });
      for (const f of names) {
        if (rewritten[f] !== files[f]) fs.writeFileSync(path.join(dir, f), rewritten[f]);
      }
      return cfg;
    },
  ]);
}

module.exports = withDevVariant;
module.exports.devWidgetSources = devWidgetSources;
