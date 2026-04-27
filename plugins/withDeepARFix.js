const { withProjectBuildGradle } = require('@expo/config-plugins');

module.exports = function withDeepARFix(config) {
  return withProjectBuildGradle(config, function(config) {
    if (config.modResults.contents.includes('withDeepARFix-applied')) {
      return config;
    }

    config.modResults.contents += `
// withDeepARFix-applied
allprojects {
  plugins.withId('com.android.library') {
    android {
      compileSdkVersion 35
    }
  }
  plugins.withId('com.android.application') {
    android {
      compileSdkVersion 35
    }
  }
}
`;
    return config;
  });
};