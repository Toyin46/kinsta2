const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withDeepARFix(config) {
  return withDangerousMod(config, [
    'android',
    function(config) {
      const deeparGradle = path.join(
        config.modRequest.projectRoot,
        'node_modules',
        'react-native-deepar',
        'android',
        'build.gradle'
      );

      if (fs.existsSync(deeparGradle)) {
        let contents = fs.readFileSync(deeparGradle, 'utf8');

        // Replace compileSdkVersion 29 with 35
        contents = contents.replace(
          /compileSdkVersion\s+\d+/g,
          'compileSdkVersion 35'
        );

        // Replace targetSdkVersion if present
        contents = contents.replace(
          /targetSdkVersion\s+\d+/g,
          'targetSdkVersion 34'
        );

        fs.writeFileSync(deeparGradle, contents, 'utf8');
        console.log('[withDeepARFix] Patched react-native-deepar build.gradle');
      } else {
        console.warn('[withDeepARFix] react-native-deepar build.gradle not found');
      }

      return config;
    }
  ]);
};