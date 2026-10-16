export type YouTubeEmbedProps = {
  videoId: string;
  seekRequest?: { seconds: number; nonce: number } | null;
};
