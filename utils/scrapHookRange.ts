/**
 * Hook ranges the app owns. A marking read off a photographed hook is never
 * copied into this recommendation.
 */
import type { YarnWeight } from '@/store/machine';

export type HookRangeMm = {
  min: number;
  max: number;
};

export const HOOK_RANGE_MM: Record<YarnWeight, HookRangeMm> = {
  lace: { min: 1.5, max: 2.25 },
  fingering: { min: 2.25, max: 3.5 },
  sport: { min: 3.25, max: 3.75 },
  dk: { min: 3.5, max: 4.5 },
  worsted: { min: 4.5, max: 5.5 },
  aran: { min: 5.5, max: 6.5 },
  bulky: { min: 6.5, max: 9 },
  'super-bulky': { min: 9, max: 12 },
  jumbo: { min: 12, max: 15 },
};

export function hookRangeForWeight(weight: YarnWeight): HookRangeMm {
  return HOOK_RANGE_MM[weight];
}

export function hookRangeLabel(weight: YarnWeight): string {
  const range = hookRangeForWeight(weight);
  return `${formatMm(range.min)}–${formatMm(range.max)} mm`;
}

export function hookMmInRange(weight: YarnWeight, millimeters: number): boolean {
  if (!Number.isFinite(millimeters)) return false;
  const range = hookRangeForWeight(weight);
  return millimeters >= range.min && millimeters <= range.max;
}

function formatMm(value: number): string {
  return Number.isInteger(value) ? value.toFixed(1) : String(value);
}
