/**
 * Pure yarn-color math. Photos are reduced to pixels elsewhere; this file
 * only clusters those pixels. It does not read the filesystem or the network.
 */
import { normalizeHex } from '@/store/machine';

import { pixelsInRegions, type NormRect } from '@/utils/yarnRegion';

export type YarnColorFamily =
  | 'Neutral'
  | 'Yellow'
  | 'Orange'
  | 'Red'
  | 'Pink'
  | 'Purple'
  | 'Blue'
  | 'Blue/Green'
  | 'Green'
  | 'Brown';

export type YarnNamedColor = {
  hex: string;
  name: string;
  family: YarnColorFamily;
};

/** Common crochet colorways. Each hex is the reference the matcher compares against. */
export const YARN_COLOR_DICTIONARY: readonly YarnNamedColor[] = [
  { name: 'White', hex: '#F7F7F5', family: 'Neutral' },
  { name: 'Ivory', hex: '#F4F1EA', family: 'Neutral' },
  { name: 'Cream', hex: '#F4F1DE', family: 'Neutral' },
  { name: 'Champagne', hex: '#F3E6C8', family: 'Neutral' },
  { name: 'Oatmeal', hex: '#E6D3B3', family: 'Neutral' },
  { name: 'Ecru', hex: '#CDB891', family: 'Neutral' },
  { name: 'Beige', hex: '#E4D5B7', family: 'Neutral' },
  { name: 'Light Gray', hex: '#D0D0D4', family: 'Neutral' },
  { name: 'Silver', hex: '#C0C0C4', family: 'Neutral' },
  { name: 'Gray', hex: '#8E8E93', family: 'Neutral' },
  { name: 'Charcoal', hex: '#36454F', family: 'Neutral' },
  { name: 'Black', hex: '#1A1A1A', family: 'Neutral' },
  { name: 'Taupe', hex: '#8B7E74', family: 'Neutral' },
  { name: 'Butter Yellow', hex: '#F6E27A', family: 'Yellow' },
  { name: 'Lemon', hex: '#F7E14A', family: 'Yellow' },
  { name: 'Mustard Yellow', hex: '#D4A017', family: 'Yellow' },
  { name: 'Gold', hex: '#C9A227', family: 'Yellow' },
  { name: 'Marigold', hex: '#E39B14', family: 'Yellow' },
  { name: 'Peach', hex: '#FFCBA4', family: 'Orange' },
  { name: 'Apricot', hex: '#FBCEB1', family: 'Orange' },
  { name: 'Coral', hex: '#FF7F50', family: 'Orange' },
  { name: 'Tangerine', hex: '#F28500', family: 'Orange' },
  { name: 'Burnt Orange', hex: '#CC5500', family: 'Orange' },
  { name: 'Terracotta', hex: '#C65D3B', family: 'Orange' },
  { name: 'Rust', hex: '#B7410E', family: 'Orange' },
  { name: 'Cherry Red', hex: '#C41E3A', family: 'Red' },
  { name: 'Brick Red', hex: '#8E3A2F', family: 'Red' },
  { name: 'Burgundy', hex: '#6B1E3A', family: 'Red' },
  { name: 'Blush Pink', hex: '#F0B7C4', family: 'Pink' },
  { name: 'Dusty Rose', hex: '#C99090', family: 'Pink' },
  { name: 'Rose', hex: '#E8A0BF', family: 'Pink' },
  { name: 'Hot Pink', hex: '#FF69B4', family: 'Pink' },
  { name: 'Berry', hex: '#8E3A59', family: 'Pink' },
  { name: 'Raspberry', hex: '#B03060', family: 'Pink' },
  { name: 'Lavender', hex: '#C8A2C8', family: 'Purple' },
  { name: 'Lilac', hex: '#C8A2E0', family: 'Purple' },
  { name: 'Periwinkle', hex: '#8E82C8', family: 'Purple' },
  { name: 'Violet', hex: '#7B4BBE', family: 'Purple' },
  { name: 'Plum', hex: '#6B2D5B', family: 'Purple' },
  { name: 'Eggplant', hex: '#4B1D4A', family: 'Purple' },
  { name: 'Sky Blue', hex: '#87CEEB', family: 'Blue' },
  { name: 'Cornflower', hex: '#6495ED', family: 'Blue' },
  { name: 'Denim', hex: '#3B5F8A', family: 'Blue' },
  { name: 'Royal Blue', hex: '#2E4A9E', family: 'Blue' },
  { name: 'Navy', hex: '#2C3E6B', family: 'Blue' },
  { name: 'Indigo', hex: '#3D348B', family: 'Blue' },
  { name: 'Aqua', hex: '#7FDBDA', family: 'Blue/Green' },
  { name: 'Turquoise', hex: '#40E0D0', family: 'Blue/Green' },
  { name: 'Teal', hex: '#2A9D8F', family: 'Blue/Green' },
  { name: 'Seafoam', hex: '#93E9BE', family: 'Blue/Green' },
  { name: 'Mint', hex: '#98D4BB', family: 'Blue/Green' },
  { name: 'Lime', hex: '#B5D64A', family: 'Green' },
  { name: 'Sage Green', hex: '#9CAF88', family: 'Green' },
  { name: 'Olive', hex: '#6B7036', family: 'Green' },
  { name: 'Moss', hex: '#6B7F4A', family: 'Green' },
  { name: 'Kelly Green', hex: '#4CBB17', family: 'Green' },
  { name: 'Emerald', hex: '#1B7A3A', family: 'Green' },
  { name: 'Forest Green', hex: '#1F4D3A', family: 'Green' },
  { name: 'Tan', hex: '#C4A574', family: 'Brown' },
  { name: 'Camel', hex: '#C19A6B', family: 'Brown' },
  { name: 'Caramel', hex: '#C68E5B', family: 'Brown' },
  { name: 'Soft Fudge', hex: '#C6A36E', family: 'Brown' },
  { name: 'Coffee Bean', hex: '#4B3428', family: 'Brown' },
  { name: 'Espresso', hex: '#3C2415', family: 'Brown' },
];

export const YARN_COLOR_FAMILIES: readonly YarnColorFamily[] = [
  'Neutral',
  'Yellow',
  'Orange',
  'Red',
  'Pink',
  'Purple',
  'Blue',
  'Blue/Green',
  'Green',
  'Brown',
];

const MAX_EXTRACTED_COLORS = 5;
/** Redmean distance under this is one yarn color seen twice. */
const CLOSE_COLOR_DISTANCE = 46;
/** #000000–#181818: crushed shadow, not a chosen black yarn. */
const EXTREME_BLACK = 0x18;
/** Blown-out paper or flash. Cream, ivory, and white yarn sit below this. */
const OVEREXPOSED_WHITE = 250;

type Rgb = { r: number; g: number; b: number };
type Hsl = { h: number; s: number; l: number };

type DictionaryEntry = YarnNamedColor & { rgb: Rgb };

const DICTIONARY: readonly DictionaryEntry[] = YARN_COLOR_DICTIONARY.flatMap((entry) => {
  const rgb = hexToRgb(entry.hex);
  return rgb ? [{ ...entry, rgb }] : [];
});

/**
 * Label any hex with the closest craft yarn name.
 * The returned hex is the caller's color, normalized, not the dictionary swatch.
 */
export function hexToYarnColorName(hex: string): YarnNamedColor {
  const normalized = normalizeHex(hex);
  const rgb = normalized ? hexToRgb(normalized) : null;
  const fallback = DICTIONARY.find((entry) => entry.name === 'Gray') ?? DICTIONARY[0];
  if (!normalized || !rgb || !fallback) {
    return { hex: '#8E8E93', name: 'Gray', family: 'Neutral' };
  }
  let nearest = fallback;
  let best = Number.POSITIVE_INFINITY;
  for (const entry of DICTIONARY) {
    const distance = weightedRgbDistance(rgb, entry.rgb);
    if (distance < best) {
      best = distance;
      nearest = entry;
    }
  }
  return { hex: normalized, name: nearest.name, family: nearest.family };
}

/** `Teal (#2A9D8F)` — the form the local scrap prompt expects. */
export function formatYarnColorLabel(color: { name: string; hex: string }): string {
  const hex = normalizeHex(color.hex) ?? color.hex.trim();
  return `${color.name.trim()} (${hex})`;
}

/** Strip a trailing hex so titles stay short while prompts keep the code. */
export function yarnColorLabelName(color: string): string {
  const trimmed = color.trim();
  const name = trimmed.replace(/\s*\(#[0-9A-Fa-f]{3,8}\)\s*$/, '').trim();
  return name || trimmed;
}

/**
 * Cluster pixels from an already selected yarn region.
 * White, black, gray, and pale yarn stay. Only crushed black and blown-out
 * flash are set aside, and only when the region has other pixels.
 * Similar lightness on the same hue collapses; a different hue stays.
 */
export function swatchesFromPixels(pixels: readonly (readonly [number, number, number])[]): YarnNamedColor[] {
  if (pixels.length === 0) return [];
  const kept: Rgb[] = [];
  const extreme: Rgb[] = [];
  for (const pixel of pixels) {
    const rgb = { r: clampChannel(pixel[0]), g: clampChannel(pixel[1]), b: clampChannel(pixel[2]) };
    if (isExtremeBlack(rgb) || isOverexposedWhite(rgb)) extreme.push(rgb);
    else kept.push(rgb);
  }
  const pool = kept.length > 0 ? kept : extreme;
  const buckets = new Map<string, { count: number; r: number; g: number; b: number }>();
  for (const rgb of pool) {
    const key = `${rgb.r >> 4},${rgb.g >> 4},${rgb.b >> 4}`;
    const current = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
    current.count += 1;
    current.r += rgb.r;
    current.g += rgb.g;
    current.b += rgb.b;
    buckets.set(key, current);
  }
  const ranked = [...buckets.values()].sort((a, b) => b.count - a.count);
  const hexes: string[] = [];
  for (const bucket of ranked) {
    const rgb = {
      r: Math.round(bucket.r / bucket.count),
      g: Math.round(bucket.g / bucket.count),
      b: Math.round(bucket.b / bucket.count),
    };
    if (kept.length > 0 && (isExtremeBlack(rgb) || isOverexposedWhite(rgb))) continue;
    hexes.push(rgbToHex(rgb));
    if (hexes.length >= MAX_EXTRACTED_COLORS * 3) break;
  }
  if (hexes.length === 0 && ranked[0]) {
    const bucket = ranked[0];
    hexes.push(
      rgbToHex({
        r: Math.round(bucket.r / bucket.count),
        g: Math.round(bucket.g / bucket.count),
        b: Math.round(bucket.b / bucket.count),
      }),
    );
  }
  return refineHexList(hexes);
}

/** Sample only the given regions. An empty region list does not read the bitmap. */
export function colorsFromRegionPixels(
  width: number,
  height: number,
  pixels: readonly (readonly [number, number, number])[],
  regions: readonly NormRect[],
): YarnNamedColor[] {
  if (regions.length === 0) return [];
  return swatchesFromPixels(pixelsInRegions(width, height, pixels, regions));
}

export function refineHexList(hexes: readonly string[]): YarnNamedColor[] {
  const parsed: { hex: string; rgb: Rgb }[] = [];
  for (const hex of hexes) {
    const normalized = normalizeHex(hex);
    const rgb = normalized ? hexToRgb(normalized) : null;
    if (!normalized || !rgb) continue;
    if (parsed.some((item) => item.hex === normalized)) continue;
    parsed.push({ hex: normalized, rgb });
  }
  const usable = parsed.filter((item) => !isExtremeBlack(item.rgb) && !isOverexposedWhite(item.rgb));
  const pool = usable.length > 0 ? usable : parsed.slice(0, 1);
  const chosen: YarnNamedColor[] = [];
  const chosenRgb: Rgb[] = [];
  for (const item of pool) {
    const named = hexToYarnColorName(item.hex);
    const namedRgb = hexToRgb(named.hex);
    if (!namedRgb) continue;
    const close = chosen.some((existing, index) => {
      if (existing.name === named.name) return true;
      const existingRgb = chosenRgb[index];
      if (!existingRgb) return false;
      if (weightedRgbDistance(namedRgb, existingRgb) < CLOSE_COLOR_DISTANCE) return true;
      return isLightingDuplicate(namedRgb, existingRgb);
    });
    if (close) continue;
    chosen.push(named);
    chosenRgb.push(namedRgb);
    if (chosen.length >= MAX_EXTRACTED_COLORS) break;
  }
  return chosen;
}

/**
 * Same hue and similar saturation with a modest lightness gap is one dye
 * under different light. A different hue, or a neutral at a different
 * lightness (white vs gray vs black), stays.
 */
export function isLightingDuplicate(a: Rgb, b: Rgb): boolean {
  const left = rgbToHsl(a);
  const right = rgbToHsl(b);
  const lightDelta = Math.abs(left.l - right.l);
  if (left.s < 0.14 && right.s < 0.14) return lightDelta <= 0.1;
  if (left.s < 0.14 || right.s < 0.14) return false;
  const hueDelta = circularHueDelta(left.h, right.h);
  const satDelta = Math.abs(left.s - right.s);
  return hueDelta <= 14 && satDelta <= 0.22 && lightDelta <= 0.28;
}

function rgbToHsl(rgb: Rgb): Hsl {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return { h: 0, s: 0, l: lightness };
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue = 0;
  if (max === r) hue = ((g - b) / delta) % 6;
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  hue *= 60;
  if (hue < 0) hue += 360;
  return { h: hue, s: saturation, l: lightness };
}

function circularHueDelta(a: number, b: number): number {
  const delta = Math.abs(a - b) % 360;
  return Math.min(delta, 360 - delta);
}

/** Weighted Euclidean RGB (redmean). Nearer colors are the ones a dyer would call the same. */
function weightedRgbDistance(a: Rgb, b: Rgb): number {
  const rMean = (a.r + b.r) / 2;
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  const redWeight = 2 + rMean / 256;
  const blueWeight = 2 + (255 - rMean) / 256;
  return Math.sqrt(redWeight * dr * dr + 4 * dg * dg + blueWeight * db * db);
}

function isExtremeBlack(rgb: Rgb): boolean {
  return rgb.r <= EXTREME_BLACK && rgb.g <= EXTREME_BLACK && rgb.b <= EXTREME_BLACK;
}

function isOverexposedWhite(rgb: Rgb): boolean {
  return rgb.r >= OVEREXPOSED_WHITE && rgb.g >= OVEREXPOSED_WHITE && rgb.b >= OVEREXPOSED_WHITE;
}

function hexToRgb(hex: string): Rgb | null {
  const normalized = normalizeHex(hex);
  if (!normalized) return null;
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

function rgbToHex(rgb: Rgb): string {
  const channel = (value: number) => clampChannel(value).toString(16).padStart(2, '0').toUpperCase();
  return `#${channel(rgb.r)}${channel(rgb.g)}${channel(rgb.b)}`;
}

function clampChannel(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(255, Math.max(0, Math.round(value)));
}

const SAMPLE_EDGE = 48;

/** Canvas page for already-cropped yarn regions. Each URI is one region. */
export function yarnCropSampleHtml(imageUris: readonly string[]): string {
  const sources = JSON.stringify([...imageUris]);
  return `<!DOCTYPE html><html><body><script>
    var sources = ${sources};
    function post(pixels) {
      var payload = JSON.stringify({ pixels: pixels });
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(payload);
    }
    if (!sources.length) { post([]); }
    else {
      var pending = sources.length;
      var pixels = [];
      var failed = false;
      sources.forEach(function (src) {
        var img = new Image();
        img.onload = function () {
          if (failed) return;
          var canvas = document.createElement('canvas');
          canvas.width = ${SAMPLE_EDGE};
          canvas.height = ${SAMPLE_EDGE};
          var ctx = canvas.getContext('2d');
          if (!ctx) { failed = true; post([]); return; }
          ctx.drawImage(img, 0, 0, ${SAMPLE_EDGE}, ${SAMPLE_EDGE});
          var data = ctx.getImageData(0, 0, ${SAMPLE_EDGE}, ${SAMPLE_EDGE}).data;
          for (var i = 0; i < data.length; i += 4) {
            if (data[i + 3] < 200) continue;
            pixels.push([data[i], data[i + 1], data[i + 2]]);
          }
          pending -= 1;
          if (pending === 0) post(pixels);
        };
        img.onerror = function () { if (!failed) { failed = true; post([]); } };
        img.src = src;
      });
    }
  </script></body></html>`;
}
