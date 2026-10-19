/**
 * expo-file-system adapter for the pinned scrap model.
 * Hashing uses FileHandle.readBytes in 1 MB chunks.
 */
import { Directory, File, FileMode, Paths } from 'expo-file-system';

import { SCRAP_HASH_CHUNK_BYTES, SCRAP_MODEL_PIN, visionModelPair, type VisionModelPair } from '@/utils/scrapModelPin';
import {
  deletePinnedModel,
  downloadPinnedModel,
  downloadPinnedPair,
  inspectPinnedModel,
  inspectPinnedPair,
  scrapModelPaths,
  type ModelTransferIO,
  type ModelTransferProgress,
} from '@/utils/scrapModelTransfer';

const MODELS_DIRECTORY = 'models';

export function scrapModelDirectoryUri(): string | null {
  const root = Paths.document;
  if (!root?.uri) return null;
  const directory = new Directory(root, MODELS_DIRECTORY);
  if (!directory.exists) directory.create({ intermediates: true });
  return directory.uri.endsWith('/') ? directory.uri : `${directory.uri}/`;
}

export function scrapModelFileUri(): string | null {
  const directory = scrapModelDirectoryUri();
  if (!directory) return null;
  return scrapModelPaths(directory, SCRAP_MODEL_PIN.filename).final;
}

function fileAt(uri: string): File {
  return new File(uri);
}

function expoTransferIO(): ModelTransferIO {
  let open: { path: string; handle: ReturnType<File['open']> } | null = null;
  const finishRead = () => {
    open?.handle.close();
    open = null;
  };
  return {
    availableBytes: () => Paths.availableDiskSpace,
    fileSize: (path) => {
      const file = fileAt(path);
      return file.exists ? file.size : null;
    },
    fileStamp: (path) => {
      const file = fileAt(path);
      if (!file.exists) return null;
      return file.lastModified;
    },
    finishRead,
    readChunk: (path, offset, length) => {
      if (!open || open.path !== path) {
        finishRead();
        open = { path, handle: fileAt(path).open(FileMode.ReadOnly) };
      }
      open.handle.offset = offset;
      return open.handle.readBytes(length);
    },
    deleteFile: (path) => {
      const file = fileAt(path);
      if (file.exists) file.delete();
    },
    moveFile: (from, to) => {
      const source = fileAt(from);
      const destination = fileAt(to);
      if (destination.exists) destination.delete();
      source.moveSync(destination);
    },
    readText: (path) => {
      const file = fileAt(path);
      if (!file.exists) return null;
      return file.textSync();
    },
    writeText: (path, text) => {
      const file = fileAt(path);
      if (!file.exists) file.create();
      file.write(text);
    },
    download: async ({ url, destination, onProgress, bindCancel }) => {
      const file = fileAt(destination);
      if (file.exists) file.delete();
      const task = File.createDownloadTask(url, file, {
        onProgress: ({ bytesWritten, totalBytes }) => onProgress(bytesWritten, totalBytes),
      });
      bindCancel(() => task.cancel());
      await task.downloadAsync();
    },
  };
}

export async function inspectInstalledScrapModel(
  onProgress?: (update: ModelTransferProgress) => void,
): Promise<'ready' | 'missing'> {
  const directory = scrapModelDirectoryUri();
  if (!directory) return 'missing';
  return inspectPinnedModel(expoTransferIO(), SCRAP_MODEL_PIN, scrapModelPaths(directory, SCRAP_MODEL_PIN.filename), onProgress);
}

export async function downloadInstalledScrapModel(
  onProgress?: (update: ModelTransferProgress) => void,
  cancel?: { cancelled: () => boolean; bind: (cancel: () => void) => void },
): Promise<string> {
  const directory = scrapModelDirectoryUri();
  if (!directory) throw new Error('Document storage is not available on this device.');
  return downloadPinnedModel(
    expoTransferIO(),
    SCRAP_MODEL_PIN,
    scrapModelPaths(directory, SCRAP_MODEL_PIN.filename),
    onProgress,
    cancel,
  );
}

export async function inspectInstalledVisionPair(
  platform: string,
  onProgress?: (update: ModelTransferProgress) => void,
): Promise<'ready' | 'missing' | 'unsupported'> {
  const pair = visionModelPair(platform);
  if (!pair) return 'unsupported';
  const directory = scrapModelDirectoryUri();
  if (!directory) return 'missing';
  return inspectPinnedPair(expoTransferIO(), visionTransferItems(directory, pair), onProgress);
}

export async function downloadInstalledVisionPair(
  platform: string,
  onProgress?: (update: ModelTransferProgress) => void,
  cancel?: { cancelled: () => boolean; bind: (cancel: () => void) => void },
): Promise<{ textPath: string; projectorPath: string }> {
  const pair = visionModelPair(platform);
  if (!pair) throw new Error('Image analysis is not available on this device.');
  const directory = scrapModelDirectoryUri();
  if (!directory) throw new Error('Document storage is not available on this device.');
  const saved = await downloadPinnedPair(expoTransferIO(), visionTransferItems(directory, pair), onProgress, cancel);
  const textPath = saved[0];
  const projectorPath = saved[1];
  if (!textPath || !projectorPath) throw new Error('The vision model download did not finish.');
  return { textPath, projectorPath };
}

function visionTransferItems(directory: string, pair: VisionModelPair) {
  return [
    { pin: pair.text, paths: scrapModelPaths(directory, pair.text.filename) },
    { pin: pair.projector, paths: scrapModelPaths(directory, pair.projector.filename) },
  ];
}

export async function deleteInstalledScrapModel(): Promise<void> {
  const directory = scrapModelDirectoryUri();
  if (!directory) return;
  await deletePinnedModel(expoTransferIO(), scrapModelPaths(directory, SCRAP_MODEL_PIN.filename));
}

export async function appendScrapBenchLine(line: string): Promise<void> {
  const directory = scrapModelDirectoryUri();
  if (!directory) return;
  const file = new File(directory, 'scrap-ai-bench.jsonl');
  const prior = file.exists ? file.textSync() : '';
  const next = `${prior}${prior.endsWith('\n') || prior.length === 0 ? '' : '\n'}${line}\n`;
  if (!file.exists) file.create();
  file.write(next);
}

export { SCRAP_HASH_CHUNK_BYTES };
