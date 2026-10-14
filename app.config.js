const appJson = require('./app.json');

/** Pass the existing YouTube key into the app so chapter lookup can run on device. */
module.exports = () => ({
  expo: {
    ...appJson.expo,
    extra: {
      ...(appJson.expo.extra ?? {}),
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
  },
});
