/** Pass the existing YouTube key into the app so chapter lookup can run on device. */
module.exports = ({ config }) => ({
  ...config,
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
