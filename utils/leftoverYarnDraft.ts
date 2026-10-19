/**
 * In-memory leftover-yarn session.
 *
 * The photo, selection, confirmed colors, and suggestions live here so a
 * pattern preview can unmount the sheet without discarding them. Nothing in
 * this module is written to disk.
 */
import type { PatternDifficulty, YarnWeight } from '@/store/machine';
import type { ScrapSuggestionResult, ScrapYarnColor } from '@/utils/scrapYarnAi';
import type { PatternDraftCheck, PatternDraftRequest } from '@/utils/scrapPatternDraft';
import type { ConfirmedCatalogResult, VisionCatalogCard } from '@/utils/scrapVisionCatalog';
import { emptyVisionFindings, type YarnVisionFindings } from '@/utils/scrapVisionOutput';
import { regionSampleKey, type YarnSampleRegion } from '@/utils/yarnRegion';

export type VisionCorrections = YarnVisionFindings & {
  gramsText: string;
  yardsText: string;
};

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
  gramsText: string;
  aiResult: { key: string; result: ScrapSuggestionResult } | null;
  scrollY: number;
  findings: YarnVisionFindings | null;
  corrections: VisionCorrections | null;
  findingsGeneration: number | null;
  findingsEdited: boolean;
  /** Vision results are separate from details the maker typed after a failed analysis. */
  analysisSource: 'vision' | 'user' | null;
  confirmed: boolean;
  catalog: VisionCatalogCard[] | null;
  catalogNote: string | null;
  patternMake: string;
  patternSize: string;
  patternSkill: PatternDifficulty;
  patternDraft: PatternDraftCheck | { kind: 'failed'; message: string } | null;
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
    yardsText: '',
    gramsText: '',
    aiResult: null,
    scrollY: 0,
    findings: null,
    corrections: null,
    findingsGeneration: null,
    findingsEdited: false,
    analysisSource: null,
    confirmed: false,
    catalog: null,
    catalogNote: null,
    patternMake: '',
    patternSize: '',
    patternSkill: 'beginner',
    patternDraft: null,
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
    findings: null,
    corrections: null,
    findingsGeneration: null,
    findingsEdited: false,
    analysisSource: null,
    confirmed: false,
    catalog: null,
    catalogNote: null,
    patternDraft: null,
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

/** A late reply is ignored once the photo changes or the maker edits the findings. */
export function applyVisionFindings(generation: number, findings: YarnVisionFindings): boolean {
  if (draft.photoGeneration !== generation) return false;
  if (draft.findingsEdited && draft.findingsGeneration === generation) return false;
  const corrections = correctionsFrom(findings, draft.gramsText, draft.yardsText);
  draft = {
    ...draft,
    findings,
    corrections,
    findingsGeneration: generation,
    findingsEdited: false,
    analysisSource: 'vision',
    confirmed: false,
    catalog: null,
    catalogNote: null,
    patternDraft: null,
    weight: corrections.yarnCategory === 'uncertain' ? draft.weight : corrections.yarnCategory,
  };
  emit();
  return true;
}

/** Details the maker typed because the photo was not analyzed. */
export function beginManualYarnFindings(force = false): void {
  if (!force && draft.analysisSource === 'vision' && draft.corrections) return;
  draft = {
    ...draft,
    findings: null,
    corrections: correctionsFrom(emptyVisionFindings(), draft.gramsText, draft.yardsText),
    findingsGeneration: draft.photoGeneration,
    findingsEdited: true,
    analysisSource: 'user',
    confirmed: false,
    catalog: null,
    catalogNote: null,
    patternDraft: null,
  };
  emit();
}

export function editVisionCorrections(patch: Partial<VisionCorrections>): void {
  if (!draft.corrections) return;
  const corrections = { ...draft.corrections, ...patch };
  draft = {
    ...draft,
    corrections,
    findingsEdited: true,
    confirmed: false,
    catalog: null,
    catalogNote: null,
    patternDraft: null,
    yardsText: corrections.yardsText,
    gramsText: corrections.gramsText,
    weight: corrections.yarnCategory === 'uncertain' ? draft.weight : corrections.yarnCategory,
  };
  emit();
}

export function confirmVisionFindings(result: ConfirmedCatalogResult): ConfirmedCatalogResult | null {
  if (!draft.corrections) return null;
  draft = {
    ...draft,
    confirmed: true,
    yardsText: draft.corrections.yardsText,
    gramsText: draft.corrections.gramsText,
    weight: draft.corrections.yarnCategory === 'uncertain' ? draft.weight : draft.corrections.yarnCategory,
    catalog: result.status === 'results' ? result.cards : [],
    catalogNote:
      result.status === 'results'
        ? result.amountNote
        : result.status === 'need-category'
          ? 'Choose a yarn category in the list above, then tap View matching projects again.'
          : 'Choose a leftover amount above, or enter yards, then tap View matching projects again. Grams are not turned into yards.',
  };
  emit();
  return result;
}

export function updatePatternRequest(patch: Partial<Pick<LeftoverYarnDraft, 'patternMake' | 'patternSize' | 'patternSkill'>>): void {
  draft = { ...draft, ...patch, patternDraft: null };
  emit();
}

export function storePatternDraft(patternDraft: LeftoverYarnDraft['patternDraft']): void {
  draft = { ...draft, patternDraft };
  emit();
}

export function patternRequestFromDraft(source: LeftoverYarnDraft = draft): PatternDraftRequest | null {
  if (!source.corrections || source.corrections.yarnCategory === 'uncertain') return null;
  const yards = source.corrections.yardsText.trim().match(/^\d+$/) ? Number(source.corrections.yardsText) : null;
  return {
    make: source.patternMake.trim(),
    size: source.patternSize.trim(),
    skill: source.patternSkill,
    yarnCategory: source.corrections.yarnCategory,
    yards: yards != null && yards > 0 ? yards : null,
  };
}

function correctionsFrom(findings: YarnVisionFindings, gramsText: string, yardsText: string): VisionCorrections {
  return {
    subjects: [...findings.subjects],
    yarnCategory: findings.yarnCategory,
    categorySource: findings.categorySource,
    labelText: findings.labelText,
    hookObservedMarking: findings.hookObservedMarking,
    stitches: findings.stitches === 'uncertain' ? 'uncertain' : findings.stitches.map((stitch) => ({ ...stitch, alternatives: [...stitch.alternatives] })),
    quantityCategory: findings.quantityCategory,
    gramsText,
    yardsText,
  };
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
    findings: source.findings ? { ...source.findings, subjects: [...source.findings.subjects] } : null,
    corrections: source.corrections
      ? {
          ...source.corrections,
          subjects: [...source.corrections.subjects],
          stitches:
            source.corrections.stitches === 'uncertain'
              ? 'uncertain'
              : source.corrections.stitches.map((stitch) => ({ ...stitch, alternatives: [...stitch.alternatives] })),
        }
      : null,
    catalog: source.catalog ? source.catalog.map((card) => ({ ...card, pattern: { ...card.pattern } })) : null,
    patternDraft: source.patternDraft ? cloneDraft(source.patternDraft) : null,
  };
}

function cloneDraft(value: NonNullable<LeftoverYarnDraft['patternDraft']>): NonNullable<LeftoverYarnDraft['patternDraft']> {
  return JSON.parse(JSON.stringify(value)) as NonNullable<LeftoverYarnDraft['patternDraft']>;
}
