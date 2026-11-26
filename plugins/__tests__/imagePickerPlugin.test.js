// Revisely Dev's image picker plugin (modules-dev/expo-image-picker/app.plugin.js): the account picture's two purpose
// strings, and nothing about the microphone.
const { pickerInfoPlist } = require('../../modules-dev/expo-image-picker/app.plugin.js');

const MIC = 'The app’s own microphone text';
const options = { photosPermission: 'Photos text', cameraPermission: 'Camera text' };

describe('modules-dev/expo-image-picker plugin', () => {
  it('writes the photo library and camera texts', () => {
    const out = pickerInfoPlist({ CFBundleName: 'Revisely Dev' }, options);
    expect(out.NSPhotoLibraryUsageDescription).toBe('Photos text');
    expect(out.NSCameraUsageDescription).toBe('Camera text');
    expect(out.CFBundleName).toBe('Revisely Dev');
  });

  it('leaves the microphone text as it was, and adds none', () => {
    expect(pickerInfoPlist({ NSMicrophoneUsageDescription: MIC }, options).NSMicrophoneUsageDescription).toBe(MIC);
    expect(pickerInfoPlist({}, options)).not.toHaveProperty('NSMicrophoneUsageDescription');
  });

  it('refuses to run without the app’s own texts (never the package’s "Allow $(PRODUCT_NAME)…")', () => {
    expect(() => pickerInfoPlist({}, { photosPermission: 'Photos text' })).toThrow(/cameraPermission/);
    expect(() => pickerInfoPlist({}, undefined)).toThrow(/photosPermission/);
  });
});
