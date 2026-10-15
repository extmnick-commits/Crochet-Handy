/**
 * YouTube tutorial player for web. A real iframe, not the native WebView.
 */
import { createElement, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import type { YouTubeEmbedProps } from '@/components/media/YouTubeEmbed.types';
import {
  youtubeCaptionsCommand,
  youtubeEmbedPostMessageOrigin,
  youtubeEmbedUrl,
} from '@/utils/youtube';

export type { YouTubeEmbedProps } from '@/components/media/YouTubeEmbed.types';

function postPlayerCommand(iframe: HTMLIFrameElement, func: string, args: unknown[]) {
  iframe.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
}

export function YouTubeEmbed({ videoId, seekRequest, captionsEnabled = true }: YouTubeEmbedProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    if (!seekRequest) return;
    const iframe = iframeRef.current;
    if (!iframe) return;
    postPlayerCommand(iframe, 'seekTo', [seekRequest.seconds, true]);
    postPlayerCommand(iframe, 'playVideo', []);
  }, [seekRequest]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const payload = youtubeCaptionsCommand(captionsEnabled);
    const send = () => iframe.contentWindow?.postMessage(JSON.stringify(payload), '*');
    send();
    let count = 0;
    const timer = window.setInterval(() => {
      send();
      count += 1;
      if (count >= 6) window.clearInterval(timer);
    }, 350);
    return () => window.clearInterval(timer);
  }, [captionsEnabled, videoId]);

  const src = youtubeEmbedUrl(videoId, {
    captionsEnabled,
    origin: youtubeEmbedPostMessageOrigin(),
  });

  return (
    <View style={styles.fill} pointerEvents="auto">
      {createElement('iframe', {
        key: videoId,
        ref: iframeRef,
        src,
        title: 'Pattern tutorial',
        allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen',
        allowFullScreen: true,
        referrerPolicy: 'strict-origin-when-cross-origin',
        onLoad: () => {
          const iframe = iframeRef.current;
          if (!iframe) return;
          iframe.contentWindow?.postMessage(JSON.stringify(youtubeCaptionsCommand(captionsEnabled)), '*');
        },
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
