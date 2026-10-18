/**
 * Yarn color extraction.
 *
 * A development build reads the palette through `react-native-image-colors`
 * (Android Palette, iOS UIImageColors, web Vibrant). Expo Go does not ship
 * that native module, so a failed require falls through to a canvas sampler.
 * On native without a DOM, the photo is downscaled with `expo-image-manipulator`
 * and the swatch picker samples that bitmap in a tiny canvas page.
 */
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

import { normalizeHex } from '@/store/machine';

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
const SAMPLE_EDGE = 48;
/** #000000–#181818: shadow and crushed backgrounds. */
const EXTREME_BLACK = 0x18;
/** Blown-out paper or flash. Cream and ivory sit below this. */
const OVEREXPOSED_WHITE = 250;

type Rgb = { r: number; g: number; b: number };

type DictionaryEntry = YarnNamedColor & { rgb: Rgb };

const DICTIONARY: readonly DictionaryEntry[] = YARN_COLOR_DICTIONARY.flatMap((entry) => {
  const rgb = hexToRgb(entry.hex);
  return rgb ? [{ ...entry, rgb }] : [];
});

const PALETTE_KEYS = [
  'dominant',
  'primary',
  'vibrant',
  'darkVibrant',
  'lightVibrant',
  'secondary',
  'muted',
  'detail',
  'average',
  'background',
] as const;

type ImageColorsModule = {
  getColors?: (uri: string, config?: { fallback?: string; quality?: 'low'; pixelSpacing?: number }) => Promise<unknown>;
  default?: { getColors?: ImageColorsModule['getColors'] };
};

type ManipulatorContext = {
  resize: (size: { width: number }) => ManipulatorContext;
  renderAsync: () => Promise<{ saveAsync: (options: { compress: number; format: string }) => Promise<{ uri?: string }> }>;
};

type ManipulatorModule = {
  ImageManipulator?: { manipulate?: (uri: string) => ManipulatorContext };
  SaveFormat?: { JPEG?: string };
  manipulateAsync?: (
    uri: string,
    actions: { resize: { width: number } }[],
    options: { compress: number; format: string },
  ) => Promise<{ uri?: string }>;
};

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

export async function extractYarnColorsFromUri(imageUri: string): Promise<YarnNamedColor[]> {
  const uri = imageUri.trim();
  if (!uri) return [];
  try {
    const nativeHexes = await readNativePalette(uri);
    const nativeSwatches = refineHexList(nativeHexes);
    const nativeFailedBlack = nativeSwatches.length === 1 && nativeSwatches[0]?.hex === '#000000';
    if (nativeSwatches.length > 0 && !nativeFailedBlack) return nativeSwatches;

    const pixels = await samplePixelsWithCanvas(uri);
    if (pixels && pixels.length > 0) {
      const sampled = swatchesFromPixels(pixels);
      if (sampled.length > 0) return sampled;
    }
    return nativeFailedBlack ? [] : nativeSwatches;
  } catch {
    return [];
  }
}

/** Shrink a photo before the native canvas probe. The original uri is kept if resize fails. */
/** True when `react-native-image-colors` is linked (not Expo Go / web). */
export function isYarnNativePaletteAvailable(): boolean {
  if (Platform.OS === 'web') return false;
  if (Constants.executionEnvironment === 'storeClient') return false;
  return hasImageColorsNativeModule();
}

/**
 * Expo Go samples yarn colors in a hidden WebView. `content://` and some `file://`
 * URIs cannot be drawn to canvas there, so convert to a JPEG data URL when needed.
 */
export async function prepareYarnColorProbeUri(imageUri: string): Promise<string> {
  const uri = imageUri.trim();
  if (!uri) return uri;
  const scaled = await downscaleYarnPhoto(uri);
  const candidate = scaled.trim() || uri;
  if (candidate.startsWith('data:image/')) return candidate;
  try {
    const base64 = await FileSystem.readAsStringAsync(candidate, {
      encoding: FileSystem.EncodingType.Base64,
    });
    if (!base64) return candidate;
    const lower = candidate.toLowerCase();
    const mime = lower.includes('.png') ? 'image/png' : 'image/jpeg';
    return `data:${mime};base64,${base64}`;
  } catch {
    return candidate;
  }
}

export async function downscaleYarnPhoto(imageUri: string): Promise<string> {
  const uri = imageUri.trim();
  if (!uri) return imageUri;
  try {
    const manipulator = loadImageManipulator();
    if (!manipulator) return uri;
    const format = manipulator.SaveFormat?.JPEG ?? 'jpeg';
    if (manipulator.ImageManipulator?.manipulate) {
      const context = manipulator.ImageManipulator.manipulate(uri).resize({ width: SAMPLE_EDGE });
      const rendered = await context.renderAsync();
      const saved = await rendered.saveAsync({ compress: 0.8, format });
      if (saved.uri) return saved.uri;
    }
    if (manipulator.manipulateAsync) {
      const saved = await manipulator.manipulateAsync(uri, [{ resize: { width: SAMPLE_EDGE } }], { compress: 0.8, format });
      if (saved.uri) return saved.uri;
    }
  } catch {
    // A missing resize just means the probe reads the original photo.
  }
  return uri;
}

/** Canvas page for Expo Go, where the palette module is not linked. */
export function yarnColorSampleHtml(imageUri: string): string {
  const src = JSON.stringify(imageUri);
  return `<!DOCTYPE html><html><body><script>
    var img = new Image();
    function post(pixels) {
      var payload = JSON.stringify({ pixels: pixels });
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(payload);
    }
    img.onload = function () {
      var canvas = document.createElement('canvas');
      canvas.width = ${SAMPLE_EDGE};
      canvas.height = ${SAMPLE_EDGE};
      var ctx = canvas.getContext('2d');
      if (!ctx) { post([]); return; }
      ctx.drawImage(img, 0, 0, ${SAMPLE_EDGE}, ${SAMPLE_EDGE});
      var data = ctx.getImageData(0, 0, ${SAMPLE_EDGE}, ${SAMPLE_EDGE}).data;
      var pixels = [];
      for (var i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 200) continue;
        pixels.push([data[i], data[i + 1], data[i + 2]]);
      }
      post(pixels);
    };
    img.onerror = function () { post([]); };
    img.src = ${src};
  </script></body></html>`;
}

export function yarnSwatchesFromProbeMessage(message: string): YarnNamedColor[] {
  try {
    const parsed = JSON.parse(message) as { pixels?: unknown };
    if (!Array.isArray(parsed.pixels)) return [];
    const pixels: [number, number, number][] = [];
    for (const pixel of parsed.pixels) {
      if (!Array.isArray(pixel) || pixel.length < 3) continue;
      const r = Number(pixel[0]);
      const g = Number(pixel[1]);
      const b = Number(pixel[2]);
      if (![r, g, b].every((value) => Number.isFinite(value))) continue;
      pixels.push([clampChannel(r), clampChannel(g), clampChannel(b)]);
    }
    return swatchesFromPixels(pixels);
  } catch {
    return [];
  }
}

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
    if (hexes.length >= MAX_EXTRACTED_COLORS * 2) break;
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

function refineHexList(hexes: readonly string[]): YarnNamedColor[] {
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
  for (const item of pool) {
    const named = hexToYarnColorName(item.hex);
    const namedRgb = hexToRgb(named.hex);
    if (!namedRgb) continue;
    const close = chosen.some((existing) => {
      if (existing.name === named.name) return true;
      const existingRgb = hexToRgb(existing.hex);
      return existingRgb != null && weightedRgbDistance(namedRgb, existingRgb) < CLOSE_COLOR_DISTANCE;
    });
    if (close) continue;
    chosen.push(named);
    if (chosen.length >= MAX_EXTRACTED_COLORS) break;
  }
  return chosen;
}

async function readNativePalette(uri: string): Promise<string[]> {
  const getColors = loadImageColors();
  if (!getColors) return [];
  try {
    const result = await getColors(uri, { fallback: '#000000', quality: 'low', pixelSpacing: 5 });
    if (!result || typeof result !== 'object') return [];
    const record = result as Record<string, unknown>;
    const hexes: string[] = [];
    for (const key of PALETTE_KEYS) {
      const value = record[key];
      if (typeof value === 'string' && normalizeHex(value)) hexes.push(value);
    }
    return hexes;
  } catch {
    return [];
  }
}

let imageColorsGetColors: ImageColorsModule['getColors'] | null | undefined;

function loadImageColors(): ImageColorsModule['getColors'] | null {
  if (imageColorsGetColors !== undefined) return imageColorsGetColors;
  imageColorsGetColors = null;

  if (Platform.OS === 'web') return imageColorsGetColors;
  // Expo Go cannot load custom native modules; the swatch picker falls back to the canvas WebView probe.
  if (Constants.executionEnvironment === 'storeClient') return imageColorsGetColors;
  if (!hasImageColorsNativeModule()) return imageColorsGetColors;

  try {
    // Dynamic require: the package calls requireNativeModule at import time and must not load without ImageColors.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const loaded: unknown = require('react-native-image-colors');
    if (!loaded || typeof loaded !== 'object') return imageColorsGetColors;
    const module = loaded as ImageColorsModule;
    if (typeof module.getColors === 'function') {
      imageColorsGetColors = module.getColors;
      return imageColorsGetColors;
    }
    if (typeof module.default?.getColors === 'function') {
      imageColorsGetColors = module.default.getColors;
      return imageColorsGetColors;
    }
  } catch {
    imageColorsGetColors = null;
  }
  return imageColorsGetColors;
}

function hasImageColorsNativeModule(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const core = require('expo-modules-core') as {
      requireOptionalNativeModule?: (name: string) => unknown;
    };
    return (
      typeof core.requireOptionalNativeModule === 'function' &&
      core.requireOptionalNativeModule('ImageColors') != null
    );
  } catch {
    return false;
  }
}

function loadImageManipulator(): ManipulatorModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const loaded: unknown = require('expo-image-manipulator');
    if (!loaded || typeof loaded !== 'object') return null;
    return loaded as ManipulatorModule;
  } catch {
    return null;
  }
}

async function samplePixelsWithCanvas(uri: string): Promise<[number, number, number][] | null> {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null;
  try {
    const image = await loadCanvasImage(uri);
    const canvas = document.createElement('canvas');
    canvas.width = SAMPLE_EDGE;
    canvas.height = SAMPLE_EDGE;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(image, 0, 0, SAMPLE_EDGE, SAMPLE_EDGE);
    const data = context.getImageData(0, 0, SAMPLE_EDGE, SAMPLE_EDGE).data;
    const pixels: [number, number, number][] = [];
    for (let index = 0; index < data.length; index += 4) {
      if ((data[index + 3] ?? 0) < 200) continue;
      pixels.push([data[index] ?? 0, data[index + 1] ?? 0, data[index + 2] ?? 0]);
    }
    return pixels;
  } catch {
    return null;
  }
}

function loadCanvasImage(uri: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = document.createElement('img');
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not read that yarn photo.'));
    image.src = uri;
  });
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
