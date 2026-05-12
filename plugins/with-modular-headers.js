/**
 * Selectively grants `modular_headers` to specific Obj-C pods that Firebase's
 * Swift pods need to import. We do NOT use `use_modular_headers!` globally,
 * because that forces RNFBApp's source files (which use plain #import) to
 * comply with strict module imports — breaks the Release-config archive build
 * with errors like "declaration of 'RCTBridgeModule' must be imported from
 * module 'RNFBApp.RNFBAppModule' before it is required".
 *
 * The pods listed below are the transitive Obj-C deps that Swift Firebase
 * pods (FirebaseCoreInternal, FirebaseAppCheck) actually need to see as
 * modules. Setting DEFINES_MODULE = YES on each, in a post_install hook,
 * applies module-map generation without touching declaration semantics in
 * the pod's source files.
 */
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MODULAR_PODS = ['GoogleUtilities', 'nanopb', 'PromisesObjC', 'FBLPromises'];
const MARKER = '# selective-modular-headers (Revisely)';

module.exports = function withModularHeaders(config) {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const podfilePath = path.join(
        cfg.modRequest.platformProjectRoot,
        'Podfile',
      );
      let contents = fs.readFileSync(podfilePath, 'utf8');

      if (contents.includes(MARKER)) {
        return cfg;
      }

      const snippet = `
${MARKER}
post_install do |installer|
  installer.pod_targets.each do |pod|
    if ${JSON.stringify(MODULAR_PODS)}.include?(pod.name)
      pod.build_settings_by_config.each do |_config, settings|
        settings['DEFINES_MODULE'] = 'YES'
      end
    end
  end
end
`;

      // Insert before the final `end` if there's a target block, otherwise
      // append to the end of the file. Expo's generated Podfile has a single
      // top-level post_install nothing — so simple append is safe.
      contents = contents.trimEnd() + '\n' + snippet + '\n';
      fs.writeFileSync(podfilePath, contents);
      return cfg;
    },
  ]);
};
