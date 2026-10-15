export type YouTubeEmbedProps = {
  videoId: string;
  seekRequest?: { seconds: number; nonce: number } | null;
  /** When false, hides closed captions on the embed (user preference). */
  captionsEnabled?: boolean;
};
