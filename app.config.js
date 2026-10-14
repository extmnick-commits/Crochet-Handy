const appJson = require('./app.json');

/** Pass the existing YouTube key into the app so chapter lookup can run on device. */
module.exports = () => ({
  expo: {
    ...appJson.expo,
    extra: {
      ...(appJson.expo.extra ?? {}),
      youtubeApiKey: process.env.YOUTUBE_API_KEY || process.env.EXPO_PUBLIC_YOUTUBE_API_KEY || '',
    },
  },
});
