const { withAppBuildGradle, withGradleProperties } = require('@expo/config-plugins');

/** Windows-friendly Gradle settings + single ABI for faster local APK builds. */
function withAndroidGradleFixes(config) {
  config = withGradleProperties(config, (config) => {
    const props = config.modResults;
    const set = (key, value) => {
      const index = props.findIndex((item) => item.type === 'property' && item.key === key);
      if (index >= 0) {
        props[index].value = value;
      } else {
        props.push({ type: 'property', key, value });
      }
    };

    set('org.gradle.parallel', 'false');
    set('org.gradle.vfs.watch', 'false');
    set('org.gradle.workers.max', '1');
    set('org.gradle.caching', 'false');
    set('reactNativeArchitectures', 'arm64-v8a');

    return config;
  });

  return withAppBuildGradle(config, (config) => {
    let contents = config.modResults.contents;
    if (!contents.includes('debuggableVariants = []')) {
      contents = contents.replace(
        /autolinkLibrariesWithApp\(\)\s*\n/,
        `autolinkLibrariesWithApp()\n\n    // Standalone APK: ship the JS bundle in debug builds (no Metro required).\n    debuggableVariants = []\n`,
      );
    }
    config.modResults.contents = contents;
    return config;
  });
}

module.exports = withAndroidGradleFixes;
