/**
 * YouTube tutorial player for iOS and Android.
 *
 * The player is an iframe inside a WebView. Loading it as a bare URL gets
 * rejected by YouTube (error 153) because the native view has no referrer;
 * the HTML document supplies one via `baseUrl`.
 */
import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { youtubeEmbedUrl } from '@/utils/youtube';

import type { YouTubeEmbedProps } from './YouTubeEmbed.web';

function buildSeekScript(seconds: number): string {
  const seekPayload = JSON.stringify({ event: 'command', func: 'seekTo', args: [seconds, true] });
  const playPayload = JSON.stringify({ event: 'command', func: 'playVideo', args: [] });
  return `(function(){var frame=document.getElementById('yt-player');if(!frame||!frame.contentWindow)return;frame.contentWindow.postMessage(${JSON.stringify(seekPayload)},'*');frame.contentWindow.postMessage(${JSON.stringify(playPayload)},'*');})();true;`;
}

export function YouTubeEmbed({ videoId, seekRequest }: YouTubeEmbedProps) {
  const webViewRef = useRef<WebView>(null);
  const src = youtubeEmbedUrl(videoId);
  const html = useMemo(
    () =>
      `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1"><style>html,body{margin:0;height:100%;background:#000}iframe{position:absolute;inset:0;width:100%;height:100%;border:0}</style></head><body><iframe id="yt-player" src="${src}" title="Pattern tutorial" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen></iframe></body></html>`,
    [src],
  );

  useEffect(() => {
    if (!seekRequest) return;
    webViewRef.current?.injectJavaScript(buildSeekScript(seekRequest.seconds));
  }, [seekRequest?.nonce, seekRequest?.seconds]);

  return (
    <View style={styles.fill}>
      <WebView
        ref={webViewRef}
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
