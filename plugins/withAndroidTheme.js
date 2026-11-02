// Android's theme accent (colorAccent): the buttons of native dialogs (Alert), the text
// cursor and its selection handles. Without it they were Material's teal. Ink, as the
// design's buttons (#1A1A1A on light, white on dark): an accent colour would be wrong for
// whichever of Indigo, Crimson and Jade the user didn't pick, and this is fixed at build time.
// Android only: it writes colors.xml, values-night/colors.xml and styles.xml.
const { AndroidConfig, withAndroidColors, withAndroidColorsNight, withAndroidStyles } = require('expo/config-plugins');

const LIGHT = '#1A1A1A';
const DARK = '#FFFFFF';

module.exports = function withAndroidTheme(config) {
  config = withAndroidColors(config, (c) => {
    c.modResults = AndroidConfig.Colors.assignColorValue(c.modResults, { name: 'colorAccent', value: LIGHT });
    return c;
  });
  config = withAndroidColorsNight(config, (c) => {
    c.modResults = AndroidConfig.Colors.assignColorValue(c.modResults, { name: 'colorAccent', value: DARK });
    return c;
  });
  config = withAndroidStyles(config, (c) => {
    c.modResults = AndroidConfig.Styles.assignStylesValue(c.modResults, {
      add: true,
      parent: AndroidConfig.Styles.getAppThemeGroup(),
      name: 'colorAccent',
      value: '@color/colorAccent',
    });
    return c;
  });
  return config;
};
