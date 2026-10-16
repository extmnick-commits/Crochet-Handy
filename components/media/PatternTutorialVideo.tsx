/**
 * Tutorial player for the pattern header. YouTube uses the iframe embed.
 * Facebook and blog clips load in a WebView.
 */
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { YouTubeEmbed } from '@/components/media/YouTubeEmbed';
import type { PatternTutorialVideoProps } from '@/components/media/PatternTutorialVideo.types';
import { Colors } from '@/constants/BambuTheme';
import { embeddedTutorialUrl, isDirectMediaUrl, normalizeHttpUrl } from '@/utils/patternAiParser';

export type { PatternTutorialVideoProps } from '@/components/media/PatternTutorialVideo.types';

export function PatternTutorialVideo({ videoId, videoUrl, seekRequest }: PatternTutorialVideoProps) {
  if (videoId) {
    return (
      <View style={styles.fill}>
        <YouTubeEmbed videoId={videoId} seekRequest={seekRequest} />
      </View>
    );
  }

  const page = videoUrl ? normalizeHttpUrl(videoUrl) : null;
  if (!page) return null;
  const embed = embeddedTutorialUrl(page) ?? page;
  const source = isDirectMediaUrl(page)
    ? { html: directMediaHtml(page), baseUrl: page }
    : isFacebookEmbed(embed)
      ? { html: framedHtml(embed), baseUrl: 'https://www.facebook.com' }
      : { uri: embed };

  return (
    <View style={styles.fill}>
      <WebView
        source={source}
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
      />
    </View>
  );
}

function isFacebookEmbed(url: string): boolean {
  return url.includes('facebook.com/plugins/video.php');
}

function framedHtml(url: string): string {
  const src = escapeAttribute(url);
  const canvas = Colors.backgroundPrimary;
  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>html,body{margin:0;height:100%;background:${canvas}}iframe{position:absolute;inset:0;width:100%;height:100%;border:0}</style></head><body><iframe src="${src}" title="Pattern tutorial" allow="autoplay; encrypted-media; fullscreen" allowfullscreen></iframe></body></html>`;
}

function directMediaHtml(url: string): string {
  const src = escapeAttribute(url);
  const canvas = Colors.backgroundPrimary;
  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>html,body{margin:0;height:100%;background:${canvas}}video{width:100%;height:100%;object-fit:contain;background:${canvas}}</style></head><body><video src="${src}" controls playsinline></video></body></html>`;
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFill,
    backgroundColor: Colors.backgroundPrimary,
  },
  web: {
    flex: 1,
    backgroundColor: Colors.backgroundPrimary,
  },
});
