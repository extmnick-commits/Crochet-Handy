/** Quick scans bound the CPU vision encoder's work; detailed scans remain opt-in. */
export type VisionScanDetail = 'quick' | 'detailed';

export const VISION_SCAN_PROFILES = {
  /** Tuned for ~60s scans on mid-range Android (smaller encoder budget than detailed). */
  quick: { longEdge: 384, imageTokens: 128 },
  detailed: { longEdge: 768, imageTokens: 512 },
} as const;
