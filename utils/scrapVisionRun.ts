/**
 * Download the platform vision pair, then run one photo or one text draft.
 * Photos stay on the device. This module does not invent findings.
 */
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { downloadInstalledVisionPair, inspectInstalledVisionPair } from '@/utils/scrapModelFiles';
import { visionModelPair } from '@/utils/scrapModelPin';
import type { ModelTransferProgress } from '@/utils/scrapModelTransfer';
import { ScrapEngineBusyError, ScrapTransferCancelledError } from '@/utils/scrapModelTransfer';
import type { PatternDraftCheck, PatternDraftRequest } from '@/utils/scrapPatternDraft';
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

export async function analyzeLeftoverPhoto(input: {
  imageUri: string;
  photoGeneration: number;
  isCurrent: () => boolean;
  onProgress?: (update: ModelTransferProgress) => void;
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
    const installed = await inspectInstalledVisionPair(platform, input.onProgress);
    if (!input.isCurrent()) return { status: 'discarded' };
    paths =
      installed === 'ready'
        ? await readyPaths(platform)
        : await downloadInstalledVisionPair(platform, input.onProgress, downloadCancel());
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
    isCurrent: input.isCurrent,
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
    const installed = await inspectInstalledVisionPair(platform);
    if (installed !== 'ready') {
      const saved = await downloadInstalledVisionPair(platform, undefined, downloadCancel());
      textPath = saved.textPath;
    } else {
      textPath = (await readyPaths(platform)).textPath;
    }
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

function readyPaths(platform: string): Promise<{ textPath: string; projectorPath: string }> {
  return downloadInstalledVisionPair(platform);
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
