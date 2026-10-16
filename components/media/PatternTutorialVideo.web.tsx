/**
 * Web tutorial player. YouTube stays on the iframe embed; other clips use a
 * video element or an iframe.
 */
import { createElement } from 'react';
import { StyleSheet, View } from 'react-native';

import { YouTubeEmbed } from '@/components/media/YouTubeEmbed';
import type { PatternTutorialVideoProps } from '@/components/media/PatternTutorialVideo.types';
import { Colors } from '@/constants/BambuTheme';
import { embeddedTutorialUrl, isDirectMediaUrl, normalizeHttpUrl } from '@/utils/patternAiParser';

export type { PatternTutorialVideoProps } from '@/components/media/PatternTutorialVideo.types';

const frameStyle = {
  position: 'absolute' as const,
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  width: '100%',
  height: '100%',
  border: 'none',
  backgroundColor: Colors.backgroundPrimary,
};

export function PatternTutorialVideo({ videoId, videoUrl, seekRequest }: PatternTutorialVideoProps) {
  if (videoId) {
    return (
      <View style={styles.fill} pointerEvents="auto">
        <YouTubeEmbed videoId={videoId} seekRequest={seekRequest} />
      </View>
    );
  }

  const page = videoUrl ? normalizeHttpUrl(videoUrl) : null;
  if (!page) return null;
  const embed = embeddedTutorialUrl(page) ?? page;

  return (
    <View style={styles.fill} pointerEvents="auto">
      {isDirectMediaUrl(page)
        ? createElement('video', {
            src: page,
            controls: true,
            playsInline: true,
            style: frameStyle,
          })
        : createElement('iframe', {
            src: embed,
            title: 'Pattern tutorial',
            allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen',
            allowFullScreen: true,
            referrerPolicy: 'strict-origin-when-cross-origin',
            style: frameStyle,
          })}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFill,
    backgroundColor: Colors.backgroundPrimary,
    zIndex: 0,
  },
});
