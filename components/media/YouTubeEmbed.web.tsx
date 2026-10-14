/**
 * YouTube tutorial player for web. A real iframe, not the native WebView.
 */
import { createElement } from 'react';
import { StyleSheet, View } from 'react-native';

import { youtubeEmbedUrl } from '@/utils/youtube';

export function YouTubeEmbed({ videoId }: { videoId: string }) {
  return (
    <View style={styles.fill} pointerEvents="auto">
      {createElement('iframe', {
        src: youtubeEmbedUrl(videoId),
        title: 'Pattern tutorial',
        allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen',
        allowFullScreen: true,
        referrerPolicy: 'strict-origin-when-cross-origin',
        style: {
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          width: '100%',
          height: '100%',
          border: 'none',
          backgroundColor: '#000000',
        },
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#000000',
    zIndex: 0,
  },
});
