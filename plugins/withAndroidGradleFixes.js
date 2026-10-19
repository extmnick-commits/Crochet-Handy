const fs = require('fs');
const path = require('path');
const { withAppBuildGradle, withDangerousMod, withGradleProperties } = require('@expo/config-plugins');

/** Android Studio's bundled JDK 25 breaks CMake prefab. Match scripts/android-env.ps1. */
function findWindowsJdk17() {
  if (process.platform !== 'win32') return null;
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
  const homes = [];
  for (const name of ['Microsoft', 'Eclipse Adoptium', 'Java']) {
    const root = path.join(programFiles, name);
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || !/^jdk-17/i.test(entry.name)) continue;
      const home = path.join(root, entry.name);
      if (fs.existsSync(path.join(home, 'bin', 'java.exe'))) homes.push(home);
    }
  }
  homes.sort().reverse();
  return homes[0] ? homes[0].replace(/\\/g, '/') : null;
}

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

    const jdk17 = findWindowsJdk17();
    if (jdk17) set('org.gradle.java.home', jdk17);

    set('org.gradle.parallel', 'false');
    set('org.gradle.vfs.watch', 'false');
    set('org.gradle.workers.max', '1');
    set('org.gradle.caching', 'false');
    set('reactNativeArchitectures', 'arm64-v8a');

    return config;
  });

  config = withDangerousMod(config, [
    'android',
    (config) => {
      if (!findWindowsJdk17()) return config;
      const daemonJvm = path.join(
        config.modRequest.platformProjectRoot,
        'gradle',
        'gradle-daemon-jvm.properties',
      );
      fs.mkdirSync(path.dirname(daemonJvm), { recursive: true });
      fs.writeFileSync(
        daemonJvm,
        '# JDK 24+ prints a native-access warning that AGP treats as a CMake prefab failure.\ntoolchainVersion=17\n',
      );
      return config;
    },
  ]);

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
