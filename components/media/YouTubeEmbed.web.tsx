/**
 * YouTube tutorial player for web. A real iframe, not the native WebView.
 */
import { createElement, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { youtubeEmbedUrl } from '@/utils/youtube';

export type YouTubeEmbedProps = {
  videoId: string;
  seekRequest?: { seconds: number; nonce: number } | null;
};

function postPlayerCommand(iframe: HTMLIFrameElement, func: string, args: unknown[]) {
  iframe.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
}

export function YouTubeEmbed({ videoId, seekRequest }: YouTubeEmbedProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    if (!seekRequest) return;
    const iframe = iframeRef.current;
    if (!iframe) return;
    postPlayerCommand(iframe, 'seekTo', [seekRequest.seconds, true]);
    postPlayerCommand(iframe, 'playVideo', []);
  }, [seekRequest]);

  const src = youtubeEmbedUrl(videoId);

  return (
    <View style={styles.fill} pointerEvents="auto">
      {createElement('iframe', {
        ref: iframeRef,
        src,
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
