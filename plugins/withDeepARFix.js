const { withProjectBuildGradle } = require('@expo/config-plugins');

module.exports = function withDeepARFix(config) {
  return withProjectBuildGradle(config, function(config) {
    if (config.modResults.contents.includes('withDeepARFix-applied')) {
      return config;
    }

    config.modResults.contents += `
// withDeepARFix-applied
subprojects {
  afterEvaluate { project ->
    if (project.hasProperty('android')) {
      project.android {
        compileSdkVersion 35
      }
    }
  }
}
`;
    return config;
  });
};