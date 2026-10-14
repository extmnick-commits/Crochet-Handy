/**
 * YouTube tutorial player for iOS and Android.
 *
 * The player is an iframe inside a WebView. Loading it as a bare URL gets
 * rejected by YouTube (error 153) because the native view has no referrer;
 * the HTML document supplies one via `baseUrl`.
 */
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { youtubeEmbedUrl } from '@/utils/youtube';

export function YouTubeEmbed({ videoId }: { videoId: string }) {
  const src = youtubeEmbedUrl(videoId);
  const html = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1"><style>html,body{margin:0;height:100%;background:#000}iframe{position:absolute;inset:0;width:100%;height:100%;border:0}</style></head><body><iframe src="${src}" title="Pattern tutorial" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen></iframe></body></html>`;

  return (
    <View style={styles.fill}>
      <WebView
        source={{ html, baseUrl: 'https://www.youtube-nocookie.com' }}
        style={styles.web}
        allowsFullscreenVideo
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        bounces={false}
        originWhitelist={['*']}
        setSupportMultipleWindows={false}
        androidLayerType="hardware"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#000000',
  },
  web: {
    flex: 1,
    backgroundColor: '#000000',
  },
});
