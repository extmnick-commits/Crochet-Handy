/**
 * In-memory leftover-yarn session.
 *
 * The photo, selection, confirmed colors, and suggestions live here so a
 * pattern preview can unmount the sheet without discarding them. Nothing in
 * this module is written to disk.
 */
import type { YarnWeight } from '@/store/machine';
import type { ScrapSuggestionResult, ScrapYarnColor } from '@/utils/scrapYarnAi';
import { regionSampleKey, type YarnSampleRegion } from '@/utils/yarnRegion';

export type LeftoverYarnDraft = {
  photoUri: string | null;
  imageWidth: number;
  imageHeight: number;
  photoGeneration: number;
  sessionEpoch: number;
  regions: YarnSampleRegion[];
  colors: ScrapYarnColor[];
  sampledKey: string | null;
  /** Set when the maker edits colors, so a late sample cannot overwrite them. */
  colorEditKey: string | null;
  weight: YarnWeight;
  yardsText: string;
  aiResult: { key: string; result: ScrapSuggestionResult } | null;
  scrollY: number;
};

export type ExtractionStamp = {
  generation: number;
  sampleKey: string;
};

const listeners = new Set<() => void>();

let draft: LeftoverYarnDraft = emptyDraft();

function emptyDraft(): LeftoverYarnDraft {
  return {
    photoUri: null,
    imageWidth: 0,
    imageHeight: 0,
    photoGeneration: 0,
    sessionEpoch: 0,
    regions: [],
    colors: [],
    sampledKey: null,
    colorEditKey: null,
    weight: 'worsted',
    yardsText: '75',
    aiResult: null,
    scrollY: 0,
  };
}

function emit(): void {
  for (const listener of listeners) listener();
}

export function getLeftoverYarnDraft(): LeftoverYarnDraft {
  return draft;
}

export function subscribeLeftoverYarnDraft(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function resetLeftoverYarnDraft(): void {
  const nextEpoch = draft.sessionEpoch + 1;
  draft = { ...emptyDraft(), sessionEpoch: nextEpoch, photoGeneration: draft.photoGeneration + 1 };
  emit();
}

export function updateLeftoverYarnDraft(patch: Partial<LeftoverYarnDraft>): void {
  draft = { ...draft, ...patch };
  emit();
}

/** A new photo drops the old selection and any suggestions built from it. */
export function replaceLeftoverPhoto(uri: string): void {
  draft = {
    ...draft,
    photoUri: uri,
    imageWidth: 0,
    imageHeight: 0,
    photoGeneration: draft.photoGeneration + 1,
    regions: [],
    colors: [],
    sampledKey: null,
    colorEditKey: null,
    aiResult: null,
    scrollY: 0,
  };
  emit();
}

export function setLeftoverImageSize(width: number, height: number): void {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) return;
  const nextWidth = Math.round(width);
  const nextHeight = Math.round(height);
  if (draft.imageWidth === nextWidth && draft.imageHeight === nextHeight) return;
  draft = { ...draft, imageWidth: nextWidth, imageHeight: nextHeight };
  emit();
}

export function setLeftoverRegions(regions: readonly YarnSampleRegion[]): void {
  draft = {
    ...draft,
    regions: regions.map((region) => ({ ...region })),
    colors: [],
    sampledKey: null,
    colorEditKey: null,
    aiResult: null,
  };
  emit();
}

export function editLeftoverColors(colors: readonly ScrapYarnColor[]): void {
  const key = regionSampleKey(draft.photoGeneration, draft.regions);
  draft = {
    ...draft,
    colors: colors.map((color) => ({ name: color.name, hex: color.hex })),
    sampledKey: key,
    colorEditKey: key,
    aiResult: null,
  };
  emit();
}

export function stampLeftoverExtraction(source: LeftoverYarnDraft = draft): ExtractionStamp {
  return {
    generation: source.photoGeneration,
    sampleKey: regionSampleKey(source.photoGeneration, source.regions),
  };
}

/**
 * Apply a sample only when the photo and regions are still the ones that
 * started it, and the maker has not edited those colors since.
 */
export function applySampledColors(
  source: LeftoverYarnDraft,
  stamp: ExtractionStamp,
  colors: readonly ScrapYarnColor[],
): LeftoverYarnDraft | null {
  const currentKey = regionSampleKey(source.photoGeneration, source.regions);
  if (stamp.generation !== source.photoGeneration) return null;
  if (stamp.sampleKey !== currentKey) return null;
  if (source.colorEditKey === currentKey) return null;
  return {
    ...source,
    colors: colors.map((color) => ({ name: color.name, hex: color.hex })),
    sampledKey: currentKey,
  };
}

export function commitSampledColors(stamp: ExtractionStamp, colors: readonly ScrapYarnColor[]): boolean {
  const next = applySampledColors(draft, stamp, colors);
  if (!next) return false;
  draft = next;
  emit();
  return true;
}

export function leftoverYarnSnapshot(source: LeftoverYarnDraft = draft): LeftoverYarnDraft {
  return {
    ...source,
    regions: source.regions.map((region) => ({ ...region })),
    colors: source.colors.map((color) => ({ ...color })),
    aiResult: source.aiResult
      ? {
          key: source.aiResult.key,
          result: {
            ...source.aiResult.result,
            ideas: [...source.aiResult.result.ideas],
            catalog: [...source.aiResult.result.catalog],
            patterns: [...source.aiResult.result.patterns],
          },
        }
      : null,
  };
}
