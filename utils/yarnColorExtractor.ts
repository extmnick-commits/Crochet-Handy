/**
 * Yarn color extraction.
 *
 * Leftover yarn samples cropped regions only. Web draws those source rectangles
 * on a canvas. Native crops the same rectangles with expo-image-manipulator and
 * reads the crops in a WebView. Neither path reads the rest of the photo.
 *
 * A development build can still read a whole image through `react-native-image-colors`
 * when a caller asks for that explicitly. The leftover sheet does not.
 */
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

import {
  refineHexList,
  swatchesFromPixels,
  type YarnNamedColor,
} from '@/utils/yarnColorMath';
import { pixelCrop, type PixelCrop, type YarnSampleRegion } from '@/utils/yarnRegion';

export {
  formatYarnColorLabel,
  hexToYarnColorName,
  swatchesFromPixels,
  yarnColorLabelName,
  yarnCropSampleHtml,
  YARN_COLOR_DICTIONARY,
  YARN_COLOR_FAMILIES,
  type YarnColorFamily,
  type YarnNamedColor,
} from '@/utils/yarnColorMath';

const SAMPLE_EDGE = 48;

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
    actions: ({ resize: { width: number } } | { crop: { originX: number; originY: number; width: number; height: number } })[],
    options: { compress: number; format: string },
  ) => Promise<{ uri?: string }>;
};

/**
 * Explicit full-image palette. Leftover yarn does not call this.
 * Prefer `extractYarnColorsFromRegions` so the background is not sampled.
 */
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

/**
 * Colors inside the selected yarn regions. No regions, or a failed crop,
 * returns an empty list instead of sampling the whole photo.
 */
export async function extractYarnColorsFromRegions(
  imageUri: string,
  regions: readonly YarnSampleRegion[],
  imageWidth: number,
  imageHeight: number,
): Promise<YarnNamedColor[]> {
  const uri = imageUri.trim();
  if (!uri || regions.length === 0 || imageWidth < 1 || imageHeight < 1) return [];
  const crops = regions
    .map((region) => pixelCrop(region, imageWidth, imageHeight))
    .filter((crop) => crop.width > 0 && crop.height > 0);
  if (crops.length === 0) return [];
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return [];
  try {
    const image = await loadCanvasImage(uri);
    const pixels: [number, number, number][] = [];
    for (const crop of crops) {
      const source = scaleCrop(crop, imageWidth, imageHeight, image.naturalWidth || imageWidth, image.naturalHeight || imageHeight);
      const sample = sampleCrop(image, source);
      if (!sample) return [];
      pixels.push(...sample);
    }
    return swatchesFromPixels(pixels);
  } catch {
    return [];
  }
}

/** Crop each region to its own JPEG. A failed crop does not substitute the original photo. */
export async function cropYarnRegions(imageUri: string, crops: readonly PixelCrop[]): Promise<string[]> {
  const uri = imageUri.trim();
  if (!uri || crops.length === 0) return [];
  const manipulator = loadImageManipulator();
  if (!manipulator?.manipulateAsync && !manipulator?.ImageManipulator?.manipulate) return [];
  const format = manipulator.SaveFormat?.JPEG ?? 'jpeg';
  const uris: string[] = [];
  for (const crop of crops) {
    if (crop.width < 1 || crop.height < 1) return [];
    try {
      const saved = await cropOne(manipulator, uri, crop, format);
      if (!saved) return [];
      uris.push(saved);
    } catch {
      return [];
    }
  }
  return uris;
}

/** True when `react-native-image-colors` is linked (not Expo Go / web). */
export function isYarnNativePaletteAvailable(): boolean {
  if (Platform.OS === 'web') return false;
  if (Constants.executionEnvironment === 'storeClient') return false;
  return hasImageColorsNativeModule();
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

async function cropOne(
  manipulator: ManipulatorModule,
  uri: string,
  crop: PixelCrop,
  format: string,
): Promise<string | null> {
  const actions = [
    { crop: { originX: crop.originX, originY: crop.originY, width: crop.width, height: crop.height } },
    { resize: { width: SAMPLE_EDGE } },
  ];
  if (manipulator.manipulateAsync) {
    const saved = await manipulator.manipulateAsync(uri, actions, { compress: 0.85, format });
    return saved.uri ?? null;
  }
  return null;
}

function scaleCrop(crop: PixelCrop, reportedW: number, reportedH: number, naturalW: number, naturalH: number): PixelCrop {
  const scaleX = naturalW / Math.max(1, reportedW);
  const scaleY = naturalH / Math.max(1, reportedH);
  const originX = Math.max(0, Math.min(naturalW - 1, Math.round(crop.originX * scaleX)));
  const originY = Math.max(0, Math.min(naturalH - 1, Math.round(crop.originY * scaleY)));
  const width = Math.max(1, Math.min(naturalW - originX, Math.round(crop.width * scaleX)));
  const height = Math.max(1, Math.min(naturalH - originY, Math.round(crop.height * scaleY)));
  return { originX, originY, width, height };
}

function sampleCrop(image: HTMLImageElement, crop: PixelCrop): [number, number, number][] | null {
  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE_EDGE;
  canvas.height = SAMPLE_EDGE;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.drawImage(image, crop.originX, crop.originY, crop.width, crop.height, 0, 0, SAMPLE_EDGE, SAMPLE_EDGE);
  const data = context.getImageData(0, 0, SAMPLE_EDGE, SAMPLE_EDGE).data;
  const pixels: [number, number, number][] = [];
  for (let index = 0; index < data.length; index += 4) {
    if ((data[index + 3] ?? 0) < 200) continue;
    pixels.push([data[index] ?? 0, data[index + 1] ?? 0, data[index + 2] ?? 0]);
  }
  return pixels;
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
      if (typeof value === 'string') hexes.push(value);
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

function clampChannel(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(255, Math.max(0, Math.round(value)));
}
