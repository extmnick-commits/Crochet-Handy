/**
 * Download the platform vision pair, then run one photo or one text draft.
 * Photos stay on the device. This module does not invent findings.
 */
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import {
  deleteObsoleteAndroidVisionFiles,
  downloadInstalledVisionPair,
  inspectInstalledVisionPair,
  installedVisionPairPaths,
} from '@/utils/scrapModelFiles';
import { visionModelPair } from '@/utils/scrapModelPin';
import { modelTransferStatusLabel, ScrapEngineBusyError, ScrapTransferCancelledError, type ModelTransferProgress } from '@/utils/scrapModelTransfer';
import type { PatternDraftCheck, PatternDraftRequest } from '@/utils/scrapPatternDraft';
import type { VisionScanDetail } from '@/utils/scrapVisionConfig';
import { isLocalScrapAiSupported } from '@/utils/scrapYarnAi';
import {
  cancelActiveVisionAnalysis,
  runPatternDraft,
  runVisionAnalysis,
  type VisionAnalysisResult,
  type VisionLlamaRuntime,
  type VisionSessionPlatform,
} from '@/utils/scrapVisionSession';

export { cancelActiveVisionAnalysis };

const progressListeners = new Set<(update: ModelTransferProgress) => void>();
let preparing: Promise<{ textPath: string; projectorPath: string }> | null = null;

export type VisionModelStatus =
  | { phase: 'idle' }
  | { phase: 'checking' | 'download'; ratio: number; detail: string }
  | { phase: 'ready' }
  | { phase: 'failed' };

let visionStatus: VisionModelStatus = { phase: 'idle' };
const statusListeners = new Set<() => void>();

export function getVisionModelStatus(): VisionModelStatus {
  return visionStatus;
}

export function subscribeVisionModelStatus(listener: () => void): () => void {
  statusListeners.add(listener);
  return () => {
    statusListeners.delete(listener);
  };
}

let lastStatusAt = 0;

function statusDetail(status: VisionModelStatus): string {
  return status.phase === 'checking' || status.phase === 'download' ? status.detail : '';
}

function publishVisionStatus(next: VisionModelStatus, force = false): void {
  const now = Date.now();
  const samePhase = visionStatus.phase === next.phase;
  const sameDetail = statusDetail(visionStatus) === statusDetail(next);
  if (!force && samePhase && sameDetail && now - lastStatusAt < 400) return;
  lastStatusAt = now;
  visionStatus = next;
  for (const listener of statusListeners) listener();
}

/** Start the platform vision download without blocking launch. A later scan joins the same download. */
export function prefetchVisionModels(): void {
  void ensureVisionPair().catch(() => undefined);
}

export function ensureVisionPair(
  onProgress?: (update: ModelTransferProgress) => void,
): Promise<{ textPath: string; projectorPath: string }> {
  if (onProgress) progressListeners.add(onProgress);
  if (!preparing) {
    preparing = prepareVisionPair().finally(() => {
      preparing = null;
    });
  }
  const pending = preparing;
  return pending.finally(() => {
    if (onProgress) progressListeners.delete(onProgress);
  });
}

function emitProgress(update: ModelTransferProgress): void {
  publishVisionStatus({
    phase: update.phase === 'download' ? 'download' : 'checking',
    ratio: Math.max(0, Math.min(1, update.ratio)),
    detail: modelTransferStatusLabel(update),
  });
  for (const listener of progressListeners) listener(update);
}

async function prepareVisionPair(): Promise<{ textPath: string; projectorPath: string }> {
  const platform = sessionPlatform();
  if (!isLocalScrapAiSupported() || visionModelPair(platform) == null || loadVisionRuntime() == null) {
    publishVisionStatus({ phase: 'idle' });
    throw new Error('Image analysis is not available on this device.');
  }
  try {
    if (platform === 'android') await deleteObsoleteAndroidVisionFiles();
    const installed = await inspectInstalledVisionPair(platform, emitProgress);
    if (installed === 'ready') {
      const ready = installedVisionPairPaths(platform);
      if (ready) {
        publishVisionStatus({ phase: 'ready' }, true);
        return ready;
      }
    }
    const saved = await downloadInstalledVisionPair(platform, emitProgress, downloadCancel());
    publishVisionStatus({ phase: 'ready' }, true);
    return saved;
  } catch (error) {
    if (error instanceof ScrapTransferCancelledError) publishVisionStatus({ phase: 'idle' }, true);
    else publishVisionStatus({ phase: 'failed' }, true);
    throw error;
  }
}

export async function analyzeLeftoverPhoto(input: {
  imageUri: string;
  photoGeneration: number;
  scanDetail?: VisionScanDetail;
  isCurrent: () => boolean;
  onProgress?: (update: ModelTransferProgress) => void;
  onPhase?: (phase: 'load' | 'read') => void;
}): Promise<VisionAnalysisResult> {
  const platform = sessionPlatform();
  const runtime = loadVisionRuntime();
  const supported = isLocalScrapAiSupported() && visionModelPair(platform) != null && runtime != null;
  if (!supported) {
    return {
      status: 'unsupported',
      message: 'Image analysis needs the installed iPhone or Android app. This device cannot inspect the photo.',
    };
  }
  let paths: { textPath: string; projectorPath: string };
  try {
    paths = await ensureVisionPair(input.onProgress);
    if (!input.isCurrent()) return { status: 'discarded' };
  } catch (error) {
    if (error instanceof ScrapTransferCancelledError) return { status: 'cancelled' };
    if (error instanceof ScrapEngineBusyError) {
      return { status: 'failed', message: 'On-device analysis is busy. Wait for the current download or photo to finish.' };
    }
    return { status: 'failed', message: 'The vision model could not be prepared. The photo was not analyzed.' };
  }
  if (!input.isCurrent()) return { status: 'discarded' };
  return runVisionAnalysis({
    runtime,
    supported: true,
    platform,
    modelPath: paths.textPath,
    projectorPath: paths.projectorPath,
    imageUri: input.imageUri,
    photoGeneration: input.photoGeneration,
    scanDetail: input.scanDetail,
    isCurrent: input.isCurrent,
    onPhase: input.onPhase,
  });
}

export async function createLeftoverPatternDraft(input: {
  request: PatternDraftRequest;
  isCurrent: () => boolean;
}): Promise<PatternDraftCheck | { kind: 'failed'; message: string } | { kind: 'cancelled' } | { kind: 'discarded' }> {
  const platform = sessionPlatform();
  const runtime = loadVisionRuntime();
  if (!isLocalScrapAiSupported() || !runtime || !visionModelPair(platform)) {
    return { kind: 'failed', message: 'Pattern drafts need the on-device model, and this device does not have it.' };
  }
  let textPath = '';
  try {
    textPath = (await ensureVisionPair()).textPath;
  } catch (error) {
    if (error instanceof ScrapTransferCancelledError) return { kind: 'cancelled' };
    return { kind: 'failed', message: 'The on-device model could not be prepared for a draft.' };
  }
  return runPatternDraft({
    runtime,
    supported: true,
    platform,
    modelPath: textPath,
    request: input.request,
    isCurrent: input.isCurrent,
  });
}

let activeDownloadCancel: (() => void) | null = null;

export function cancelVisionDownload(): void {
  activeDownloadCancel?.();
  cancelActiveVisionAnalysis();
}

function downloadCancel(): { cancelled: () => boolean; bind: (cancel: () => void) => void } {
  let cancelled = false;
  let nativeCancel: () => void = () => undefined;
  const handle = {
    cancelled: () => cancelled,
    bind: (cancel: () => void) => {
      nativeCancel = cancel;
    },
  };
  activeDownloadCancel = () => {
    cancelled = true;
    nativeCancel();
  };
  return handle;
}

function loadVisionRuntime(): VisionLlamaRuntime | null {
  if (Platform.OS === 'web') return null;
  if (Constants.executionEnvironment === 'storeClient') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const loaded: unknown = require('llama.rn');
    const initLlama = findInit(loaded);
    if (!initLlama) return null;
    return { initLlama };
  } catch {
    return null;
  }
}

function findInit(loaded: unknown): VisionLlamaRuntime['initLlama'] | null {
  if (!loaded || typeof loaded !== 'object') return null;
  const record = loaded as { initLlama?: unknown; default?: unknown };
  if (typeof record.initLlama === 'function') return record.initLlama as VisionLlamaRuntime['initLlama'];
  if (record.default && typeof record.default === 'object') {
    const nested = record.default as { initLlama?: unknown };
    if (typeof nested.initLlama === 'function') return nested.initLlama as VisionLlamaRuntime['initLlama'];
  }
  return null;
}

function sessionPlatform(): VisionSessionPlatform {
  if (Platform.OS === 'ios' || Platform.OS === 'android' || Platform.OS === 'web' || Platform.OS === 'macos' || Platform.OS === 'windows') {
    return Platform.OS;
  }
  return 'web';
}
