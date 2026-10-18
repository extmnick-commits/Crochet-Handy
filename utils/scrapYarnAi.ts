/**
 * On-device leftover-yarn suggestions.
 *
 * The GGUF file lives in the app document directory and is loaded only for a
 * single `llama.rn` completion. The context is always released so iOS Jetsam
 * and Android's low-memory killer are not left holding the model.
 * Expo Go and web never touch the native module; they get the rule fallback.
 */
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

import {
  isYarnWeight,
  normalizeHex,
  type CrochetPattern,
  type PatternDifficulty,
  type YarnWeight,
} from '@/store/machine';
import { patternsForScrapProjects } from '@/utils/patternCatalog';

export const SCRAP_MODEL_FILENAME = 'Qwen2.5-1.5B-Instruct-Q4_K_M.gguf';

/** Bartowski's Q4_K_M build. Saved locally under the filename above. */
const SCRAP_MODEL_URL =
  'https://huggingface.co/bartowski/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/Qwen2.5-1.5B-Instruct-Q4_K_M.gguf';

/** Card copy. The file is about this size; the server Content-Length is preferred while downloading. */
const APPROX_MODEL_BYTES = 950 * 1024 * 1024;

/** A truncated download must not be treated as a ready engine. */
const MIN_MODEL_BYTES = 400 * 1024 * 1024;

export const LOCAL_AI_ENGINE_LABEL = 'Download Local AI Engine (~950 MB)';

export const YARDAGE_TIERS = [
  { id: 'scrap_under_25yd', label: 'Micro Scrap <25 yds' },
  { id: 'small_25_75yd', label: 'Mini Ball 25–75 yds' },
  { id: 'half_skein_75_150yd', label: 'Half Skein 75–150 yds' },
] as const;

export type YardageTier = (typeof YARDAGE_TIERS)[number]['id'];

export type ScrapYarnColor = {
  hex: string;
  name: string;
};

export type ScannedLeftoverDraft = {
  colors: ScrapYarnColor[];
  yarnWeight: YarnWeight;
  yardageTier: YardageTier;
  hookSize?: string;
};

export type ScrapProjectIdea = {
  title: string;
  estimatedYardage: string;
  colorPlacement: string;
  hookSize: string;
  difficulty: PatternDifficulty;
};

export type ScrapSuggestionSource = 'local-ai' | 'offline-rules';

export type ScrapSuggestionResult = {
  source: ScrapSuggestionSource;
  ideas: ScrapProjectIdea[];
  patterns: CrochetPattern[];
  note?: string;
};

export type ModelDownloadProgress = {
  written: number;
  total: number;
  ratio: number;
};

export type AnalyzeLeftoverYarnParams = {
  imageUri: string;
  colors: string[];
  weight: string;
  yardageTier: YardageTier;
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

const HOOK_FOR_WEIGHT: Record<YarnWeight, string> = {
  lace: '1.75 mm',
  fingering: '2.75 mm',
  sport: '3.5 mm',
  dk: '4.0 mm',
  worsted: '5.0 mm',
  aran: '5.5 mm',
  bulky: '6.5 mm',
  'super-bulky': '9.0 mm',
  jumbo: '12.0 mm',
};

const DIFFICULTIES: readonly PatternDifficulty[] = ['beginner', 'easy', 'intermediate', 'advanced'];

type LlamaContextHandle = {
  completion: (params: {
    messages: { role: string; content: string }[];
    n_predict?: number;
    temperature?: number;
    stop?: string[];
  }) => Promise<{ text?: string }>;
  release: () => Promise<void>;
};

type LlamaModule = {
  initLlama: (params: {
    model: string;
    n_ctx: number;
    n_gpu_layers: number;
    temperature: number;
  }) => Promise<LlamaContextHandle>;
};

let llamaModule: LlamaModule | null | undefined;
let downloadInFlight: Promise<string> | null = null;

function loadLlamaModule(): LlamaModule | null {
  if (llamaModule !== undefined) return llamaModule;
  if (Platform.OS === 'web') {
    llamaModule = null;
    return null;
  }
  try {
    // Dynamic require: Expo Go and web builds must not crash when the native module is absent.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const loaded: unknown = require('llama.rn');
    llamaModule = readLlamaModule(loaded);
  } catch {
    llamaModule = null;
  }
  return llamaModule;
}

function readLlamaModule(loaded: unknown): LlamaModule | null {
  if (!loaded || typeof loaded !== 'object') return null;
  const record = loaded as { initLlama?: unknown; default?: unknown };
  if (typeof record.initLlama === 'function') return loaded as LlamaModule;
  if (record.default && typeof record.default === 'object') {
    const nested = record.default as { initLlama?: unknown };
    if (typeof nested.initLlama === 'function') return record.default as LlamaModule;
  }
  return null;
}

/** True on a dev or store build that actually linked llama.rn. False in Expo Go and on web. */
export function isLocalScrapAiSupported(): boolean {
  if (Platform.OS === 'web') return false;
  if (Constants.executionEnvironment === 'storeClient') return false;
  return loadLlamaModule() != null;
}

export function hookForYarnWeight(weight: YarnWeight): string {
  return HOOK_FOR_WEIGHT[weight];
}

function scrapModelPath(): string | null {
  const root = FileSystem.documentDirectory;
  if (!root) return null;
  return `${root}models/${SCRAP_MODEL_FILENAME}`;
}

export async function isScrapModelDownloaded(): Promise<boolean> {
  try {
    const path = scrapModelPath();
    if (!path) return false;
    const info = await FileSystem.getInfoAsync(path);
    return info.exists && info.size >= MIN_MODEL_BYTES;
  } catch {
    return false;
  }
}

export async function deleteScrapModel(): Promise<void> {
  const path = scrapModelPath();
  if (!path) return;
  try {
    await FileSystem.deleteAsync(path, { idempotent: true });
  } catch {
    // A missing file is already the state the caller wanted.
  }
}

export async function downloadScrapModel(onProgress?: (progress: ModelDownloadProgress) => void): Promise<string> {
  if (await isScrapModelDownloaded()) {
    const ready = scrapModelPath();
    if (!ready) throw new Error('Document storage is not available on this device.');
    onProgress?.({ written: 1, total: 1, ratio: 1 });
    return ready;
  }
  if (!downloadInFlight) {
    downloadInFlight = downloadScrapModelOnce(onProgress).finally(() => {
      downloadInFlight = null;
    });
  }
  return downloadInFlight;
}

async function downloadScrapModelOnce(onProgress?: (progress: ModelDownloadProgress) => void): Promise<string> {
  const root = FileSystem.documentDirectory;
  if (!root) throw new Error('Document storage is not available on this device.');
  const directory = `${root}models`;
  const destination = `${directory}/${SCRAP_MODEL_FILENAME}`;
  const directoryInfo = await FileSystem.getInfoAsync(directory);
  if (!directoryInfo.exists) {
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  }
  const existing = await FileSystem.getInfoAsync(destination);
  if (existing.exists && existing.size < MIN_MODEL_BYTES) {
    await FileSystem.deleteAsync(destination, { idempotent: true });
  }

  const download = FileSystem.createDownloadResumable(SCRAP_MODEL_URL, destination, {}, (progress) => {
    const written = progress.totalBytesWritten;
    const expected = progress.totalBytesExpectedToWrite;
    const total = expected > 0 ? expected : APPROX_MODEL_BYTES;
    onProgress?.({
      written,
      total,
      ratio: total > 0 ? Math.min(1, written / total) : 0,
    });
  });
  const result = await download.downloadAsync();
  if (!result?.uri) throw new Error('The local AI engine download did not finish.');
  const saved = await FileSystem.getInfoAsync(result.uri);
  if (!saved.exists || saved.size < MIN_MODEL_BYTES) {
    throw new Error('The local AI engine download was incomplete.');
  }
  onProgress?.({ written: saved.size, total: saved.size, ratio: 1 });
  return result.uri;
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

function hueName([r, g, b]: [number, number, number]): string {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2 / 255;
  if (max - min < 22) {
    if (lightness > 0.88) return 'Ivory';
    if (lightness > 0.7) return 'Light gray';
    if (lightness > 0.45) return 'Gray';
    if (lightness > 0.2) return 'Charcoal';
    return 'Black';
  }
  let hue = 0;
  const delta = max - min || 1;
  if (max === r) hue = ((g - b) / delta) % 6;
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  hue *= 60;
  if (hue < 0) hue += 360;
  const pale = lightness > 0.72;
  if (hue < 20 || hue >= 345) return pale ? 'Blush' : 'Red';
  if (hue < 45) return pale ? 'Peach' : 'Orange';
  if (hue < 70) return pale ? 'Cream' : 'Mustard';
  if (hue < 160) return pale ? 'Sage' : 'Green';
  if (hue < 200) return pale ? 'Aqua' : 'Teal';
  if (hue < 255) return pale ? 'Sky' : 'Blue';
  if (hue < 290) return pale ? 'Lilac' : 'Purple';
  return pale ? 'Pink' : 'Magenta';
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
  if (nearest && nearest.distance <= 42) return nearest.swatch;
  return { hex: normalized, name: hueName(rgb) };
}

export function dominantYarnColors(pixels: readonly (readonly [number, number, number])[], limit = 4): ScrapYarnColor[] {
  const buckets = new Map<string, { rgb: [number, number, number]; count: number }>();
  for (const pixel of pixels) {
    const r = Math.min(255, Math.round(Math.max(0, pixel[0]) / 32) * 32);
    const g = Math.min(255, Math.round(Math.max(0, pixel[1]) / 32) * 32);
    const b = Math.min(255, Math.round(Math.max(0, pixel[2]) / 32) * 32);
    const key = `${r},${g},${b}`;
    const current = buckets.get(key);
    if (current) current.count += 1;
    else buckets.set(key, { rgb: [r, g, b], count: 1 });
  }
  const ranked = [...buckets.values()].sort((a, b) => b.count - a.count);
  const chosen: ScrapYarnColor[] = [];
  for (const bucket of ranked) {
    const hex = `#${bucket.rgb.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
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
    canvas.width = 24;
    canvas.height = 24;
    const context = canvas.getContext('2d');
    if (!context) return [];
    context.drawImage(image, 0, 0, 24, 24);
    const data = context.getImageData(0, 0, 24, 24).data;
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
      canvas.width = 24;
      canvas.height = 24;
      var ctx = canvas.getContext('2d');
      if (!ctx) { post([]); return; }
      ctx.drawImage(img, 0, 0, 24, 24);
      var data = ctx.getImageData(0, 0, 24, 24).data;
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

function isYardageTier(value: string): value is YardageTier {
  return YARDAGE_TIERS.some((tier) => tier.id === value);
}

function colorPhrase(colors: readonly string[]): string {
  const clean = colors.map((color) => color.trim()).filter((color) => color.length > 0);
  if (clean.length === 0) return 'your leftover yarn';
  if (clean.length === 1) return clean[0] ?? 'your leftover yarn';
  if (clean.length === 2) return `${clean[0]} and ${clean[1]}`;
  return `${clean.slice(0, -1).join(', ')}, and ${clean[clean.length - 1]}`;
}

function placement(colors: readonly string[], kind: 'stripe' | 'block' | 'detail', weight: YarnWeight): string {
  const primary = colors[0] ?? 'the main color';
  const second = colors[1] ?? primary;
  const third = colors[2] ?? second;
  const weightLabel = weight === 'super-bulky' ? 'super bulky' : weight;
  if (kind === 'stripe') {
    return colors.length > 1
      ? `Stripe ${primary} and ${second} every two rounds in ${weightLabel} weight so each leftover stays visible.`
      : `Work every round in ${primary} ${weightLabel} weight, with a ridge stitch that reads as a stripe.`;
  }
  if (kind === 'block') {
    const accent = colors.length > 2 ? `, then finish with ${third}` : '';
    return colors.length > 1
      ? `Color-block the body in ${primary} and the edge in ${second}${accent}. Keep the yarn ${weightLabel} weight.`
      : `Keep the body and the edge in ${primary} ${weightLabel} weight.`;
  }
  const accent = colors.length > 2 ? `, and ${third} for one tiny accent` : '';
  return colors.length > 1
    ? `Use ${primary} for the main shape and ${second} for the face, stem, or loop${accent}. ${weightLabel} weight throughout.`
    : `Use ${primary} for the shape and the small details, in ${weightLabel} weight.`;
}

export function fallbackScrapIdeas(input: {
  colors: readonly string[];
  weight: YarnWeight;
  yardageTier: YardageTier;
}): ScrapProjectIdea[] {
  const colors = input.colors.map((color) => color.trim()).filter((color) => color.length > 0);
  const phrase = colorPhrase(colors);
  const primary = colors[0] ?? 'Leftover';
  const second = colors[1] ?? primary;
  const hookSize = hookForYarnWeight(input.weight);
  if (input.yardageTier === 'scrap_under_25yd') {
    return [
      {
        title: `${primary} keychain charm`,
        estimatedYardage: '12–18 yd',
        colorPlacement: placement(colors, 'detail', input.weight),
        hookSize,
        difficulty: 'beginner',
      },
      {
        title: `${phrase} hair scrunchie`,
        estimatedYardage: '15–24 yd',
        colorPlacement: placement(colors, 'stripe', input.weight),
        hookSize,
        difficulty: 'beginner',
      },
      {
        title: `${primary} mug coaster`,
        estimatedYardage: '18–25 yd',
        colorPlacement: placement(colors, 'block', input.weight),
        hookSize,
        difficulty: 'easy',
      },
    ];
  }
  if (input.yardageTier === 'half_skein_75_150yd') {
    return [
      {
        title: `${phrase} color-block headband`,
        estimatedYardage: '80–110 yd',
        colorPlacement: placement(colors, 'block', input.weight),
        hookSize,
        difficulty: 'easy',
      },
      {
        title: `${primary} mini amigurumi`,
        estimatedYardage: '90–140 yd',
        colorPlacement: placement(colors, 'detail', input.weight),
        hookSize,
        difficulty: 'intermediate',
      },
      {
        title: `${phrase} striped dishcloth`,
        estimatedYardage: '75–120 yd',
        colorPlacement: placement(colors, 'stripe', input.weight),
        hookSize,
        difficulty: 'beginner',
      },
    ];
  }
  return [
    {
      title: `${phrase} striped coaster pair`,
      estimatedYardage: '40–70 yd',
      colorPlacement: placement(colors, 'stripe', input.weight),
      hookSize,
      difficulty: 'easy',
    },
    {
      title: `${primary} amigurumi keychain`,
      estimatedYardage: '30–55 yd',
      colorPlacement: placement(colors, 'detail', input.weight),
      hookSize,
      difficulty: 'easy',
    },
    {
      title: colors.length > 1 ? `${second} and ${primary} scrunchie set` : `${primary} scrunchie set`,
      estimatedYardage: '35–60 yd',
      colorPlacement: placement(colors, 'block', input.weight),
      hookSize,
      difficulty: 'beginner',
    },
  ];
}

function ideaMentionsColors(idea: ScrapProjectIdea, colors: readonly string[]): boolean {
  if (colors.length === 0) return true;
  const haystack = `${idea.title} ${idea.colorPlacement}`.toLowerCase();
  return colors.some((color) => color.trim().length > 0 && haystack.includes(color.trim().toLowerCase()));
}

function readText(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function readIdea(value: unknown, colors: readonly string[], weight: YarnWeight): ScrapProjectIdea | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const title = readText(record.title ?? record.projectTitle, 80);
  const estimatedYardage = readText(record.estimatedYardage ?? record.estimated_yardage ?? record.yardage, 40);
  const colorPlacement = readText(record.colorPlacement ?? record.color_placement ?? record.placement, 240);
  const hookSize = readText(record.hookSize ?? record.hook_size, 24) || hookForYarnWeight(weight);
  const difficulty = DIFFICULTIES.find((item) => item === record.difficulty) ?? 'easy';
  if (!title || !estimatedYardage || !colorPlacement) return null;
  const idea = { title, estimatedYardage, colorPlacement, hookSize, difficulty };
  if (!ideaMentionsColors(idea, colors)) return null;
  return idea;
}

function parseModelIdeas(text: string, colors: readonly string[], weight: YarnWeight, yardageTier: YardageTier): ScrapProjectIdea[] | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!payload || typeof payload !== 'object') return null;
  const projects = (payload as { projects?: unknown }).projects;
  if (!Array.isArray(projects)) return null;
  const ideas: ScrapProjectIdea[] = [];
  for (const project of projects) {
    const idea = readIdea(project, colors, weight);
    if (!idea) continue;
    ideas.push(idea);
    if (ideas.length === 3) break;
  }
  if (ideas.length === 0) return null;
  if (ideas.length < 3) {
    for (const fallback of fallbackScrapIdeas({ colors, weight, yardageTier })) {
      if (ideas.length === 3) break;
      if (ideas.some((idea) => idea.title === fallback.title)) continue;
      ideas.push(fallback);
    }
  }
  return ideas.length === 3 ? ideas : null;
}

function buildMessages(input: {
  colors: readonly string[];
  weight: YarnWeight;
  yardageTier: YardageTier;
  patterns: readonly CrochetPattern[];
}): { role: string; content: string }[] {
  const tier = YARDAGE_TIERS.find((item) => item.id === input.yardageTier)?.label ?? input.yardageTier;
  const catalog = input.patterns
    .slice(0, 8)
    .map((pattern) => `- ${pattern.title} (${pattern.hookSize}, ${pattern.difficulty})`)
    .join('\n');
  const colors = input.colors.join(', ');
  return [
    {
      role: 'system',
      content: 'You are a crochet designer helping someone use leftover yarn. Reply with JSON only. No markdown.',
    },
    {
      role: 'user',
      content: [
        `Leftover colors (use these exact names): ${colors || 'unspecified leftover yarn'}.`,
        `Yarn weight: ${input.weight}.`,
        `Leftover amount: ${tier}.`,
        `Hook to prefer: ${hookForYarnWeight(input.weight)}.`,
        'A photo of the leftovers was taken on device. Trust the color list above.',
        'Suggest exactly 3 small projects that use only these leftover colors.',
        'Prefer color-blocking, stripes, amigurumi details, coasters, keychains, or scrunchies.',
        'Each title and colorPlacement must include the exact color names above.',
        catalog ? `Nearby catalog tutorials, for inspiration only:\n${catalog}` : '',
        'Return {"projects":[{"title":"","estimatedYardage":"","colorPlacement":"","hookSize":"","difficulty":"beginner|easy|intermediate|advanced"}]}',
      ]
        .filter((line) => line.length > 0)
        .join('\n'),
    },
  ];
}

async function runLocalModel(messages: { role: string; content: string }[]): Promise<string> {
  const llama = loadLlamaModule();
  if (!llama) throw new Error('llama-unavailable');
  const model = scrapModelPath();
  if (!model) throw new Error('no-model-path');
  let context: LlamaContextHandle | null = null;
  try {
    context = await llama.initLlama({
      model,
      n_ctx: 2048,
      n_gpu_layers: 99,
      temperature: 0.2,
    });
    const result = await context.completion({
      messages,
      n_predict: 640,
      temperature: 0.2,
      stop: ['<|im_end|>', '<|endoftext|>'],
    });
    return result.text ?? '';
  } finally {
    if (context) {
      try {
        await context.release();
      } catch {
        // A failed release must not escape finally — the context has to drop either way.
      }
    }
  }
}

export async function analyzeLeftoverYarnAndSuggest(params: AnalyzeLeftoverYarnParams): Promise<ScrapSuggestionResult> {
  const weight = isYarnWeight(params.weight) ? params.weight : 'worsted';
  const yardageTier = isYardageTier(params.yardageTier) ? params.yardageTier : 'small_25_75yd';
  const provided = params.colors.map((color) => color.trim()).filter((color) => color.length > 0).slice(0, 4);
  const detected =
    provided.length > 0 ? provided : (await detectYarnColors(params.imageUri)).map((color) => color.name);
  const colors = detected.length > 0 ? detected : provided;
  const patterns = patternsForScrapProjects({ yarnWeight: weight, limit: 6 });
  const ideas = fallbackScrapIdeas({ colors, weight, yardageTier });
  const offline = (note: string): ScrapSuggestionResult => ({
    source: 'offline-rules',
    ideas,
    patterns,
    note,
  });

  if (!isLocalScrapAiSupported()) {
    return offline('On-device AI is unavailable in Expo Go and on the web, so these ideas use the offline scrap rules.');
  }
  if (!(await isScrapModelDownloaded())) {
    return offline('Download the local AI engine for custom ideas. These three use the offline scrap rules.');
  }

  try {
    const text = await runLocalModel(buildMessages({ colors, weight, yardageTier, patterns }));
    const parsed = parseModelIdeas(text, colors, weight, yardageTier);
    if (!parsed) {
      return offline('The local model did not stick to these colors, so the offline scrap rules filled in.');
    }
    return { source: 'local-ai', ideas: parsed, patterns };
  } catch {
    return offline('The local model could not finish, so these ideas use the offline scrap rules.');
  }
}
