/** Pass the existing YouTube key into the app so chapter lookup can run on device. */
const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('@expo/config-plugins');

/**
 * llama.rn compiles Metal on iOS unless RNLLAMA_DISABLE_METAL=1.
 * The llama.rn config plugin has no enableMetal option, so this env delete
 * is what keeps the Metal backend in the Pod.
 */
function withLlamaMetalEnabled(config) {
  return withDangerousMod(config, [
    'ios',
    (mod) => {
      const podfilePath = path.join(mod.modRequest.projectRoot, 'ios', 'Podfile');
      if (!fs.existsSync(podfilePath)) return mod;
      const contents = fs.readFileSync(podfilePath, 'utf8');
      if (contents.includes('LLAMA_RN_METAL')) return mod;
      const banner =
        '# LLAMA_RN_METAL: keep the iOS Metal backend compiled in.\nENV.delete(\'RNLLAMA_DISABLE_METAL\')\n';
      fs.writeFileSync(podfilePath, banner + contents);
      return mod;
    },
  ]);
}

const llamaRnPlugin = [
  'llama.rn',
  {
    // Installed llama.rn 0.13 only reads these options. enableMetal and
    // enableVulkan are not plugin options. Vulkan sources are not in the
    // published package, so a libvulkan.so manifest entry would not turn a
    // GPU backend on. OpenCL and optional Hexagon are declared here; Hexagon
    // stays off at runtime unless SCRAP_HEXAGON_OPT_IN is set.
    enableOpenCLAndHexagon: true,
    enableEntitlements: true,
    entitlementsProfile: ['production', 'development', 'preview'],
    forceCxx20: true,
  },
];

module.exports = ({ config }) => ({
  ...config,
  plugins: [...(config.plugins ?? []), llamaRnPlugin, withLlamaMetalEnabled],
  scheme: config.scheme || 'crochethandy',
  ios: {
    ...config.ios,
    bundleIdentifier: config.ios?.bundleIdentifier || 'com.crochethandy.app',
    supportsTablet: config.ios?.supportsTablet ?? true,
    infoPlist: {
      NSCameraUsageDescription:
        'Crochet Handy uses the camera to snap progress photos of your crochet.',
      NSPhotoLibraryUsageDescription:
        'Crochet Handy uses your photos to keep a progress log of each make.',
      ...(config.ios?.infoPlist ?? {}),
    },
  },
  android: {
    ...config.android,
    package: config.android?.package || 'com.crochethandy.app',
  },
  web: {
    ...config.web,
    bundler: config.web?.bundler || 'metro',
  },
  extra: {
    ...(config.extra ?? {}),
    youtubeApiKey: process.env.YOUTUBE_API_KEY || process.env.EXPO_PUBLIC_YOUTUBE_API_KEY || '',
    firebaseConfig: {
      apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || process.env.apiKey || '',
      authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || process.env.authDomain || '',
      projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || process.env.projectId || '',
      storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || process.env.storageBucket || '',
      messagingSenderId:
        process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || process.env.messagingSenderId || '',
      appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || process.env.appId || '',
    },
  },
});
