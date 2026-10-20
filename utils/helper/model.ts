/** Download and verify the text-only helper model. Vision pairs are not used. */
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import {
  deleteDownloadedVisionModels,
  downloadInstalledHelperModel,
  inspectInstalledHelperModel,
  installedHelperModelUri,
} from '@/utils/scrapModelFiles';
import { modelTransferStatusLabel, ScrapTransferCancelledError, type ModelTransferProgress } from '@/utils/scrapModelTransfer';
import { isLocalScrapAiSupported } from '@/utils/scrapYarnAi';

export type HelperModelStatus =
  | { phase: 'idle' }
  | { phase: 'checking' | 'download'; ratio: number; detail: string }
  | { phase: 'ready' }
  | { phase: 'failed' };

let helperStatus: HelperModelStatus = { phase: 'idle' };
const statusListeners = new Set<() => void>();
let preparing: Promise<void> | null = null;
let lastStatusAt = 0;

export function getHelperModelStatus(): HelperModelStatus {
  return helperStatus;
}

export function subscribeHelperModelStatus(listener: () => void): () => void {
  statusListeners.add(listener);
  return () => {
    statusListeners.delete(listener);
  };
}

export function installedHelperModelPath(): string | null {
  return helperStatus.phase === 'ready' ? installedHelperModelUri() : null;
}

function statusDetail(status: HelperModelStatus): string {
  return status.phase === 'checking' || status.phase === 'download' ? status.detail : '';
}

function publish(next: HelperModelStatus, force = false): void {
  const now = Date.now();
  const samePhase = helperStatus.phase === next.phase;
  const sameDetail = statusDetail(helperStatus) === statusDetail(next);
  if (!force && samePhase && sameDetail && now - lastStatusAt < 400) return;
  lastStatusAt = now;
  helperStatus = next;
  for (const listener of statusListeners) listener();
}

function emitProgress(update: ModelTransferProgress): void {
  publish({
    phase: update.phase === 'download' ? 'download' : 'checking',
    ratio: Math.max(0, Math.min(1, update.ratio)),
    detail: modelTransferStatusLabel(update),
  });
}

export function prefetchHelperModel(): void {
  if (!preparing) {
    preparing = prepareHelperModel().finally(() => {
      preparing = null;
    });
  }
}

async function prepareHelperModel(): Promise<void> {
  await deleteDownloadedVisionModels().catch(() => undefined);
  const supported = Platform.OS !== 'web'
    && Constants.executionEnvironment !== 'storeClient'
    && isLocalScrapAiSupported();
  if (!supported) {
    publish({ phase: 'idle' }, true);
    return;
  }
  try {
    const installed = await inspectInstalledHelperModel(emitProgress);
    if (installed === 'ready' && installedHelperModelUri()) {
      publish({ phase: 'ready' }, true);
      return;
    }
    await downloadInstalledHelperModel(emitProgress);
    publish({ phase: 'ready' }, true);
  } catch (error) {
    if (error instanceof ScrapTransferCancelledError) publish({ phase: 'idle' }, true);
    else publish({ phase: 'failed' }, true);
    throw error;
  }
}
