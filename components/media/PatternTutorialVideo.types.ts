import type { YouTubeEmbedProps } from '@/components/media/YouTubeEmbed.types';

export type PatternTutorialVideoProps = {
  videoId?: string | null;
  videoUrl?: string | null;
  seekRequest?: YouTubeEmbedProps['seekRequest'];
};
