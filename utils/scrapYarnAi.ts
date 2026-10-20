/**
 * On-device leftover-yarn suggestions.
 *
 * The GGUF file lives in the app document directory and is loaded only for a
 * single `llama.rn` completion. The context is always released so iOS Jetsam
 * and Android's low-memory killer are not left holding the model.
 * Expo Go and web never touch the native module; they get the offline plans.
 * The text model does not see the yarn photo. Colors come from the sampler
 * after the user confirms them.
 */
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { isYarnWeight, normalizeHex, type CrochetPattern, type YarnWeight } from '@/store/machine';
import { scrapCatalogSuggestions } from '@/utils/patternCatalog';
import { LOCAL_AI_ENGINE_LABEL, SCRAP_MODEL_FILENAME } from '@/utils/scrapModelPin';
import {
  appendScrapBenchLine,
  deleteInstalledScrapModel,
  downloadInstalledScrapModel,
  inspectInstalledScrapModel,
  scrapModelFileUri,
} from '@/utils/scrapModelFiles';
import { ScrapEngineBusyError, type ModelTransferProgress } from '@/utils/scrapModelTransfer';
import {
  hookForYarnWeight,
  ideasFromPlans,
  parseAvailableYards,
  rankScrapPlans,
  tierForYards,
  YARDAGE_TIERS,
  type ScrapProjectIdea,
  type YardageTier,
} from '@/utils/scrapPlans';
import {
  cancelActiveScrapSuggestion,
  runPersonalizedScrapSuggestion,
  type ScrapLlamaRuntime,
  type ScrapSessionPlatform,
} from '@/utils/scrapYarnSession';
import { yarnColorLabelName } from '@/utils/yarnColorExtractor';

export { LOCAL_AI_ENGINE_LABEL, SCRAP_MODEL_FILENAME };
export { YARDAGE_TIERS, hookForYarnWeight, parseAvailableYards, tierForYards };
export type { ScrapProjectIdea, YardageTier };
export { cancelActiveScrapSuggestion };

export type ScrapYarnColor = {
  hex: string;
  name: string;
};

export type ScannedLeftoverDraft = {
  colors: ScrapYarnColor[];
  yarnWeight: YarnWeight;
  yardageTier: YardageTier;
  availableYards: number | null;
  amountLabel?: string;
  hookSize?: string;
};

export type ScrapCatalogSuggestion = {
  pattern: CrochetPattern;
  yardageNote: string;
};

export type ScrapSuggestionSource = 'local-ai' | 'offline-rules';

export type ScrapSuggestionResult = {
  source: ScrapSuggestionSource;
  ideas: ScrapProjectIdea[];
  patterns: CrochetPattern[];
  catalog: ScrapCatalogSuggestion[];
  note?: string;
  discarded?: boolean;
  requestId?: number;
};

export type ModelDownloadProgress = ModelTransferProgress;

export type AnalyzeLeftoverYarnParams = {
  imageUri: string;
  colors: string[];
  weight: string;
  yardageTier?: YardageTier;
  availableYards: number;
  requestId?: number;
};

export const YARN_COLOR_SWATCHES: readonly ScrapYarnColor[] = [
  { name: 'Soft Fudge', hex: '#C6A36E' },
  { name: 'Champagne', hex: '#F3E6C8' },
  { name: 'Coffee Bean', hex: '#4B3428' },
  { name: 'Blush Pink', hex: '#F0B7C4' },
  { name: 'Mustard', hex: '#D4A017' },
  { name: 'Sage', hex: '#9CAF88' },
  { name: 'Cream', hex: '#E8D5C4' },
  { name: 'Forest', hex: '#1F4D3A' },
  { name: 'Plum', hex: '#6B2D5B' },
  { name: 'Navy', hex: '#2C3E6B' },
  { name: 'Ivory', hex: '#F4F1EA' },
  { name: 'Black', hex: '#1A1A1A' },
];

let llamaRuntime: ScrapLlamaRuntime | null | undefined;
let activeDownloadCancel: (() => void) | null = null;

function loadLlamaRuntime(): ScrapLlamaRuntime | null {
  if (llamaRuntime !== undefined) return llamaRuntime;
  if (Platform.OS === 'web') {
    llamaRuntime = null;
    return null;
  }
  try {
    // Dynamic require: Expo Go and web builds must not crash when the native module is absent.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const loaded: unknown = require('llama.rn');
    llamaRuntime = readLlamaRuntime(loaded);
  } catch {
    llamaRuntime = null;
  }
  return llamaRuntime;
}

function readLlamaRuntime(loaded: unknown): ScrapLlamaRuntime | null {
  const initLlama = findInitLlama(loaded);
  if (!initLlama) return null;
  return {
    initLlama: (params) => initLlama(params) as ReturnType<ScrapLlamaRuntime['initLlama']>,
  };
}

function findInitLlama(loaded: unknown): ScrapLlamaRuntime['initLlama'] | null {
  if (!loaded || typeof loaded !== 'object') return null;
  const record = loaded as { initLlama?: unknown; default?: unknown };
  if (typeof record.initLlama === 'function') return record.initLlama as ScrapLlamaRuntime['initLlama'];
  if (record.default && typeof record.default === 'object') {
    const nested = record.default as { initLlama?: unknown };
    if (typeof nested.initLlama === 'function') return nested.initLlama as ScrapLlamaRuntime['initLlama'];
  }
  return null;
}

/** True on a dev or store build that actually linked llama.rn. False in Expo Go and on web. */
export function isLocalScrapAiSupported(): boolean {
  if (Platform.OS === 'web') return false;
  if (Constants.executionEnvironment === 'storeClient') return false;
  return loadLlamaRuntime() != null;
}

export async function isScrapModelDownloaded(
  onProgress?: (progress: ModelDownloadProgress) => void,
): Promise<boolean> {
  try {
    const status = await inspectInstalledScrapModel(onProgress);
    return status === 'ready';
  } catch (error) {
    if (error instanceof ScrapEngineBusyError) return false;
    return false;
  }
}

export async function deleteScrapModel(): Promise<void> {
  await deleteInstalledScrapModel();
}

export function cancelScrapModelDownload(): void {
  activeDownloadCancel?.();
}

export async function downloadScrapModel(onProgress?: (progress: ModelDownloadProgress) => void): Promise<string> {
  let cancelled = false;
  const cancel = {
    cancelled: () => cancelled,
    bind(nativeCancel: () => void) {
      activeDownloadCancel = () => {
        cancelled = true;
        nativeCancel();
      };
      if (cancelled) nativeCancel();
    },
  };
  try {
    return await downloadInstalledScrapModel(onProgress, cancel);
  } finally {
    activeDownloadCancel = null;
  }
}

function hexToRgb(hex: string): [number, number, number] | null {
  const normalized = normalizeHex(hex);
  if (!normalized) return null;
  return [
    Number.parseInt(normalized.slice(1, 3), 16),
    Number.parseInt(normalized.slice(3, 5), 16),
    Number.parseInt(normalized.slice(5, 7), 16),
  ];
}

function colorDistance(a: [number, number, number], b: [number, number, number]): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

type PixelHsl = { hue: number; saturation: number; lightness: number };

function pixelHsl([r, g, b]: readonly [number, number, number]): PixelHsl {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  const delta = max - min;
  let hue = 0;
  let saturation = 0;
  if (delta > 0) {
    saturation = delta / (1 - Math.abs(2 * lightness - 1) || 1);
    if (max === red) hue = ((green - blue) / delta) % 6;
    else if (max === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  return { hue, saturation, lightness };
}

function hueDelta(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return Math.min(diff, 360 - diff);
}

function hueName(rgb: [number, number, number]): string {
  const { hue, saturation, lightness } = pixelHsl(rgb);
  if (saturation < 0.12) {
    if (lightness > 0.88) return 'Ivory';
    if (lightness > 0.7) return 'Light gray';
    if (lightness > 0.45) return 'Gray';
    if (lightness > 0.2) return 'Charcoal';
    return 'Black';
  }
  const pale = lightness > 0.72;
  if (hue < 18 || hue >= 345) {
    if (pale) return 'Blush';
    if (lightness < 0.42) return 'Burgundy';
    return 'Red';
  }
  if (hue < 50) {
    if (pale) return 'Peach';
    if (saturation < 0.55 && lightness < 0.62) return lightness < 0.38 ? 'Brown' : 'Taupe';
    return 'Orange';
  }
  if (hue < 70) return pale ? 'Cream' : 'Mustard';
  if (hue < 160) return pale ? 'Sage' : 'Green';
  if (hue < 200) return pale ? 'Aqua' : 'Teal';
  if (hue < 255) return pale ? 'Sky' : 'Blue';
  if (hue < 290) return pale ? 'Lilac' : 'Purple';
  return pale ? 'Pink' : 'Magenta';
}

/** Couch, wall, and paper are lighter than the yarn balls sitting on them. */
function yarnHueFamily(hsl: PixelHsl): string | null {
  if (hsl.lightness > 0.68) return null;
  if (hsl.saturation < 0.1) {
    if (hsl.lightness < 0.2) return 'black';
    if (hsl.lightness > 0.62) return null;
    return 'gray';
  }
  if (hsl.hue < 20 || hsl.hue >= 310) return 'red';
  if (hsl.hue < 48) return 'warm';
  if (hsl.hue < 75) return 'yellow';
  if (hsl.hue < 165) return 'green';
  if (hsl.hue < 200) return 'teal';
  if (hsl.hue < 255) return 'blue';
  if (hsl.hue < 310) return 'purple';
  return 'red';
}

export function describeYarnColor(hex: string): ScrapYarnColor {
  const rgb = hexToRgb(hex);
  const normalized = normalizeHex(hex);
  if (!rgb || !normalized) return { hex: YARN_COLOR_SWATCHES[0].hex, name: YARN_COLOR_SWATCHES[0].name };
  let nearest: { swatch: ScrapYarnColor; distance: number } | null = null;
  for (const swatch of YARN_COLOR_SWATCHES) {
    const swatchRgb = hexToRgb(swatch.hex);
    if (!swatchRgb) continue;
    const distance = colorDistance(rgb, swatchRgb);
    if (!nearest || distance < nearest.distance) nearest = { swatch, distance };
  }
  if (nearest) {
    const swatchRgb = hexToRgb(nearest.swatch.hex);
    const sample = pixelHsl(rgb);
    const swatch = swatchRgb ? pixelHsl(swatchRgb) : null;
    const huesAgree = swatch != null && hueDelta(sample.hue, swatch.hue) <= 22;
    const bothNeutral = swatch != null && sample.saturation < 0.12 && swatch.saturation < 0.12;
    if (nearest.distance <= 24 || (nearest.distance <= 42 && (huesAgree || bothNeutral))) {
      return nearest.swatch;
    }
  }
  return { hex: normalized, name: hueName(rgb) };
}

export function dominantYarnColors(pixels: readonly (readonly [number, number, number])[], limit = 4): ScrapYarnColor[] {
  const families = new Map<string, { count: number; r: number; g: number; b: number }>();
  for (const pixel of pixels) {
    const family = yarnHueFamily(pixelHsl(pixel));
    if (!family) continue;
    const current = families.get(family) ?? { count: 0, r: 0, g: 0, b: 0 };
    current.count += 1;
    current.r += pixel[0];
    current.g += pixel[1];
    current.b += pixel[2];
    families.set(family, current);
  }
  const total = pixels.length || 1;
  const pool = [...families.values()]
    .filter((family) => family.count >= total * 0.07)
    .sort((a, b) => b.count - a.count);
  const chosen: ScrapYarnColor[] = [];
  for (const family of pool) {
    const rgb: [number, number, number] = [
      Math.round(family.r / family.count),
      Math.round(family.g / family.count),
      Math.round(family.b / family.count),
    ];
    const hex = `#${rgb.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
    const described = describeYarnColor(hex);
    if (chosen.some((color) => color.hex === described.hex || color.name === described.name)) continue;
    const describedRgb = hexToRgb(described.hex);
    if (describedRgb && chosen.some((color) => {
      const rgb = hexToRgb(color.hex);
      return rgb != null && colorDistance(rgb, describedRgb) < 48;
    })) {
      continue;
    }
    chosen.push(described);
    if (chosen.length >= limit) break;
  }
  return chosen;
}

/** Samples a photo in the browser. Native uses the probe HTML below and the same quantizer. */
export async function detectYarnColors(imageUri: string): Promise<ScrapYarnColor[]> {
  if (!imageUri || typeof document === 'undefined') return [];
  try {
    const image = await loadProbeImage(imageUri);
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    if (!context) return [];
    context.drawImage(image, 0, 0, 64, 64);
    const data = context.getImageData(0, 0, 64, 64).data;
    const pixels: [number, number, number][] = [];
    for (let index = 0; index < data.length; index += 4) {
      if ((data[index + 3] ?? 0) < 200) continue;
      pixels.push([data[index] ?? 0, data[index + 1] ?? 0, data[index + 2] ?? 0]);
    }
    return dominantYarnColors(pixels);
  } catch {
    return [];
  }
}

function loadProbeImage(uri: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = document.createElement('img');
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not read that photo.'));
    image.src = uri;
  });
}

/** Tiny page the native scanner loads so it can read pixels without a vision model. */
export function yarnColorProbeHtml(imageUri: string): string {
  const src = JSON.stringify(imageUri);
  return `<!DOCTYPE html><html><body><script>
    var img = new Image();
    function post(pixels) {
      var payload = JSON.stringify({ pixels: pixels });
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(payload);
    }
    img.onload = function () {
      var canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      var ctx = canvas.getContext('2d');
      if (!ctx) { post([]); return; }
      ctx.drawImage(img, 0, 0, 64, 64);
      var data = ctx.getImageData(0, 0, 64, 64).data;
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

export function yarnColorsFromProbeMessage(message: string): ScrapYarnColor[] {
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
      pixels.push([r, g, b]);
    }
    return dominantYarnColors(pixels);
  } catch {
    return [];
  }
}

export function offlineScrapSuggestion(input: {
  colors: readonly ScrapYarnColor[];
  weight: YarnWeight;
  availableYards: number;
}): ScrapSuggestionResult {
  const yards = Number.isFinite(input.availableYards) ? Math.max(0, Math.round(input.availableYards)) : 0;
  const plans = rankScrapPlans(yards);
  const ideas = ideasFromPlans(plans, input.colors, input.weight);
  const catalog = scrapCatalogSuggestions({
    yarnWeight: input.weight,
    availableYards: yards,
    limit: 6,
  });
  const note =
    ideas.length === 0
      ? 'None of the planning estimates fit this yard total.'
      : 'These projects fit the yarn weight and yards. Yardage is a planning estimate.';
  return {
    source: 'offline-rules',
    ideas,
    catalog,
    patterns: catalog.map((item) => item.pattern),
    note,
  };
}

let suggestionInFlight: Promise<ScrapSuggestionResult> | null = null;

export async function analyzeLeftoverYarnAndSuggest(params: AnalyzeLeftoverYarnParams): Promise<ScrapSuggestionResult> {
  if (suggestionInFlight) return suggestionInFlight;
  const promise = runSuggestion(params);
  suggestionInFlight = promise;
  void promise.finally(() => {
    if (suggestionInFlight === promise) suggestionInFlight = null;
  });
  return promise;
}

async function runSuggestion(params: AnalyzeLeftoverYarnParams): Promise<ScrapSuggestionResult> {
  const weight = isYarnWeight(params.weight) ? params.weight : 'worsted';
  const availableYards = Number.isFinite(params.availableYards) ? Math.max(0, Math.round(params.availableYards)) : 0;
  const colors = await resolveSuggestionColors(params);
  const offline = offlineScrapSuggestion({ colors, weight, availableYards });
  const personalized = await runPersonalizedScrapSuggestion({
    runtime: loadLlamaRuntime(),
    supported: isLocalScrapAiSupported(),
    modelReady: colors.length > 0 && availableYards > 0 ? await isScrapModelDownloaded() : false,
    modelPath: scrapModelFileUri() ?? '',
    platform: sessionPlatform(),
    colors,
    weight,
    availableYards,
  });
  if (personalized.diagnostics && process.env.EXPO_PUBLIC_SCRAP_AI_BENCH === '1') {
    try {
      await appendScrapBenchLine(JSON.stringify(personalized.diagnostics));
    } catch {
      // A bench log is optional. The suggestion still stands.
    }
  }
  return {
    source: personalized.source,
    ideas: personalized.ideas,
    catalog: offline.catalog,
    patterns: offline.patterns,
    note: personalized.note ?? offline.note,
    ...(personalized.discarded ? { discarded: true } : {}),
    ...(params.requestId != null ? { requestId: params.requestId } : {}),
  };
}

async function resolveSuggestionColors(params: AnalyzeLeftoverYarnParams): Promise<ScrapYarnColor[]> {
  const provided = params.colors
    .map(parseSuggestionColor)
    .filter((color): color is ScrapYarnColor => color != null)
    .slice(0, 4);
  if (provided.length > 0) return provided;
  return [];
}

function parseSuggestionColor(value: string): ScrapYarnColor | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(.*?)\s*\(#([0-9A-Fa-f]{6})\)$/);
  if (!match) return { name: yarnColorLabelName(trimmed), hex: '#8E8E93' };
  const hex = normalizeHex(`#${match[2] ?? ''}`);
  const name = yarnColorLabelName(trimmed);
  if (!hex || !name) return null;
  return { name, hex };
}

function sessionPlatform(): ScrapSessionPlatform {
  if (
    Platform.OS === 'ios' ||
    Platform.OS === 'android' ||
    Platform.OS === 'web' ||
    Platform.OS === 'macos' ||
    Platform.OS === 'windows'
  ) {
    return Platform.OS;
  }
  return 'web';
}

