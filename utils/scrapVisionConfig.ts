/** Quick scans bound the CPU vision encoder's work; detailed scans remain opt-in. */
export type VisionScanDetail = 'quick' | 'detailed';

export const VISION_SCAN_PROFILES = {
  quick: { longEdge: 448, imageTokens: 256 },
  detailed: { longEdge: 768, imageTokens: 512 },
} as const;
