// Revisely Dev's copy of expo-image-picker's config plugin (plugin/build/withImagePicker.js in the npm package, 17.0.11),
// trimmed to what the account picture needs: photos and the camera, never video, so it leaves the microphone alone (the
// app's own text from expo-audio stays, and Android's RECORD_AUDIO is neither added nor blocked). The module's own
// AndroidManifest.xml brings CAMERA, its crop activity and its file provider.
const { createRunOncePlugin, withInfoPlist } = require('expo/config-plugins');

const pkg = require('./package.json');

/** Info.plist with iPhone's purpose strings for the photo library and the camera. Throws without either. */
function pickerInfoPlist(plist, { photosPermission, cameraPermission } = {}) {
  if (!photosPermission || !cameraPermission) {
    throw new Error('modules-dev/expo-image-picker: pass photosPermission and cameraPermission (the app writes its own).');
  }
  return { ...plist, NSPhotoLibraryUsageDescription: photosPermission, NSCameraUsageDescription: cameraPermission };
}

function withImagePicker(config, options) {
  return withInfoPlist(config, (cfg) => {
    cfg.modResults = pickerInfoPlist(cfg.modResults, options);
    return cfg;
  });
}

module.exports = createRunOncePlugin(withImagePicker, pkg.name, pkg.version);
module.exports.pickerInfoPlist = pickerInfoPlist;
