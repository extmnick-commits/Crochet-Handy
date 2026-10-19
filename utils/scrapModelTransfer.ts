/**
 * Download and checksum a pinned GGUF without loading it into one buffer.
 * File access is injected so tests can simulate truncated and corrupt files.
 */
import { createSha256 } from '@/utils/sha256';
import {
  SCRAP_HASH_CHUNK_BYTES,
  SCRAP_MODEL_STORAGE_MARGIN_BYTES,
  type ScrapModelPin,
} from '@/utils/scrapModelPin';

export type ModelTransferProgress = {
  phase: 'download' | 'verify';
  written: number;
  total: number;
  ratio: number;
};

export type ModelTransferPaths = {
  final: string;
  partial: string;
  receipt: string;
};

export type ModelTransferIO = {
  availableBytes(): number | Promise<number>;
  fileSize(path: string): number | null | Promise<number | null>;
  fileStamp(path: string): number | null | Promise<number | null>;
  readChunk(path: string, offset: number, length: number): Uint8Array | Promise<Uint8Array>;
  deleteFile(path: string): void | Promise<void>;
  moveFile(from: string, to: string): void | Promise<void>;
  readText(path: string): string | null | Promise<string | null>;
  writeText(path: string, text: string): void | Promise<void>;
  /** Close a sequential read before the file is moved or deleted. */
  finishRead?: () => void | Promise<void>;
  download(args: {
    url: string;
    destination: string;
    onProgress: (written: number, total: number) => void;
    bindCancel: (cancel: () => void) => void;
  }): Promise<void>;
};

export type ModelReceipt = {
  bytes: number;
  sha256: string;
  revision: string;
  modified: number | null;
};

export class ScrapEngineBusyError extends Error {
  constructor() {
    super('The local AI engine is busy with another download or suggestion.');
    this.name = 'ScrapEngineBusyError';
  }
}

export class ScrapTransferCancelledError extends Error {
  constructor() {
    super('The local AI engine download was cancelled.');
    this.name = 'ScrapTransferCancelledError';
  }
}

export class ScrapStorageError extends Error {
  constructor(neededBytes: number) {
    const megabytes = Math.ceil(neededBytes / (1024 * 1024));
    super(`Not enough free storage for the local AI engine. Free about ${megabytes} MB and try again.`);
    this.name = 'ScrapStorageError';
  }
}

export class ScrapChecksumError extends Error {
  constructor() {
    super('The local AI engine download did not match the expected file. It was removed.');
    this.name = 'ScrapChecksumError';
  }
}

let lockKind: string | null = null;

export function scrapEngineLockKind(): string | null {
  return lockKind;
}

export function resetScrapEngineLockForTests(): void {
  lockKind = null;
}

export async function withScrapEngineLock<T>(kind: string, fn: () => Promise<T>): Promise<T> {
  if (lockKind) throw new ScrapEngineBusyError();
  lockKind = kind;
  try {
    return await fn();
  } finally {
    lockKind = null;
  }
}

export function scrapModelPaths(directory: string, filename: string): ModelTransferPaths {
  const root = directory.endsWith('/') ? directory : `${directory}/`;
  return {
    final: `${root}${filename}`,
    partial: `${root}${filename}.part`,
    receipt: `${root}${filename}.receipt.json`,
  };
}

export function parseModelReceipt(text: string | null): ModelReceipt | null {
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as Partial<ModelReceipt>;
    if (typeof parsed.bytes !== 'number' || typeof parsed.sha256 !== 'string' || typeof parsed.revision !== 'string') {
      return null;
    }
    const modified = typeof parsed.modified === 'number' ? parsed.modified : null;
    return { bytes: parsed.bytes, sha256: parsed.sha256, revision: parsed.revision, modified };
  } catch {
    return null;
  }
}

function progress(phase: ModelTransferProgress['phase'], written: number, total: number): ModelTransferProgress {
  return {
    phase,
    written,
    total,
    ratio: total > 0 ? Math.min(1, written / total) : 0,
  };
}

const SCRAP_HASH_YIELD_BYTES = 8 * 1024 * 1024;

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

export async function hashFileChunks(
  read: (offset: number, length: number) => Uint8Array | Promise<Uint8Array>,
  size: number,
  options?: {
    chunkBytes?: number;
    onProgress?: (update: ModelTransferProgress) => void;
    cancelled?: () => boolean;
  },
): Promise<string> {
  const chunkBytes = options?.chunkBytes ?? SCRAP_HASH_CHUNK_BYTES;
  const hasher = createSha256();
  let offset = 0;
  let reported = -1;
  let sinceYield = SCRAP_HASH_YIELD_BYTES;
  while (offset < size) {
    if (sinceYield >= SCRAP_HASH_YIELD_BYTES) {
      await yieldToUi();
      sinceYield = 0;
    }
    if (options?.cancelled?.()) throw new ScrapTransferCancelledError();
    const length = Math.min(chunkBytes, size - offset);
    const chunk = await read(offset, length);
    if (chunk.length !== length) {
      throw new ScrapChecksumError();
    }
    hasher.update(chunk);
    offset += length;
    sinceYield += length;
    const update = progress('verify', offset, size);
    if (update.ratio === 1 || update.ratio - reported >= 0.02) {
      reported = update.ratio;
      options?.onProgress?.(update);
    }
  }
  options?.onProgress?.(progress('verify', size, size));
  return hasher.digest();
}

async function hashStoredFile(
  io: ModelTransferIO,
  path: string,
  size: number,
  onProgress?: (update: ModelTransferProgress) => void,
  cancelled?: () => boolean,
  chunkBytes?: number,
): Promise<string> {
  try {
    return await hashFileChunks((offset, length) => io.readChunk(path, offset, length), size, {
      chunkBytes,
      onProgress,
      cancelled,
    });
  } finally {
    await io.finishRead?.();
  }
}

export async function verifyPinnedFile(
  io: ModelTransferIO,
  pin: ScrapModelPin,
  paths: ModelTransferPaths,
  onProgress?: (update: ModelTransferProgress) => void,
  cancelled?: () => boolean,
  chunkBytes?: number,
): Promise<'ready' | 'missing' | 'invalid'> {
  const size = await io.fileSize(paths.final);
  if (size == null) return 'missing';
  if (size !== pin.bytes) return 'invalid';
  const stamp = await io.fileStamp(paths.final);
  const receipt = parseModelReceipt(await io.readText(paths.receipt));
  const receiptMatches =
    receipt != null &&
    receipt.bytes === pin.bytes &&
    receipt.sha256 === pin.sha256 &&
    receipt.revision === pin.revision;
  const stampMatches = stamp == null || receipt?.modified == null || receipt.modified === stamp;
  if (receiptMatches && stampMatches) {
    onProgress?.(progress('verify', pin.bytes, pin.bytes));
    return 'ready';
  }
  const hash = await hashStoredFile(io, paths.final, size, onProgress, cancelled, chunkBytes);
  if (hash !== pin.sha256) return 'invalid';
  const nextStamp = await io.fileStamp(paths.final);
  const next: ModelReceipt = {
    bytes: pin.bytes,
    sha256: pin.sha256,
    revision: pin.revision,
    modified: nextStamp,
  };
  await io.writeText(paths.receipt, JSON.stringify(next));
  return 'ready';
}

export async function storageIsEnough(
  io: ModelTransferIO,
  pin: ScrapModelPin,
  paths: ModelTransferPaths,
): Promise<boolean> {
  const available = await io.availableBytes();
  const partial = (await io.fileSize(paths.partial)) ?? 0;
  const finalSize = (await io.fileSize(paths.final)) ?? 0;
  const finalStampOk = finalSize === pin.bytes;
  const reclaim = partial + (finalStampOk ? 0 : finalSize);
  return available + reclaim >= pin.bytes + SCRAP_MODEL_STORAGE_MARGIN_BYTES;
}

export async function downloadPinnedModel(
  io: ModelTransferIO,
  pin: ScrapModelPin,
  paths: ModelTransferPaths,
  onProgress?: (update: ModelTransferProgress) => void,
  cancel?: { cancelled: () => boolean; bind: (cancel: () => void) => void },
  chunkBytes?: number,
): Promise<string> {
  return withScrapEngineLock('download', () => transferPinnedFile(io, pin, paths, onProgress, cancel, chunkBytes));
}

export type PinnedTransferItem = {
  pin: ScrapModelPin;
  paths: ModelTransferPaths;
};

/** One lock for the language file and its matching vision projector. */
export async function downloadPinnedPair(
  io: ModelTransferIO,
  items: readonly PinnedTransferItem[],
  onProgress?: (update: ModelTransferProgress) => void,
  cancel?: { cancelled: () => boolean; bind: (cancel: () => void) => void },
  chunkBytes?: number,
): Promise<string[]> {
  return withScrapEngineLock('download', async () => {
    if (!(await pairStorageIsEnough(io, items))) {
      const needed = items.reduce((sum, item) => sum + item.pin.bytes, SCRAP_MODEL_STORAGE_MARGIN_BYTES);
      throw new ScrapStorageError(needed);
    }
    const saved: string[] = [];
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      if (!item) continue;
      const path = await transferPinnedFile(
        io,
        item.pin,
        item.paths,
        (update) => {
          onProgress?.({
            phase: update.phase,
            written: update.written,
            total: update.total,
            ratio: items.length > 0 ? (index + update.ratio) / items.length : update.ratio,
          });
        },
        cancel,
        chunkBytes,
        true,
      );
      saved.push(path);
    }
    return saved;
  });
}

export async function inspectPinnedPair(
  io: ModelTransferIO,
  items: readonly PinnedTransferItem[],
  onProgress?: (update: ModelTransferProgress) => void,
  chunkBytes?: number,
): Promise<'ready' | 'missing'> {
  return withScrapEngineLock('verify', async () => {
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      if (!item) continue;
      const status = await verifyPinnedFile(
        io,
        item.pin,
        item.paths,
        (update) => {
          onProgress?.({
            phase: update.phase,
            written: update.written,
            total: update.total,
            ratio: items.length > 0 ? (index + update.ratio) / items.length : update.ratio,
          });
        },
        undefined,
        chunkBytes,
      );
      if (status === 'invalid') {
        await io.deleteFile(item.paths.final);
        await io.deleteFile(item.paths.receipt);
        await io.deleteFile(item.paths.partial);
        return 'missing';
      }
      if (status === 'missing') {
        await io.deleteFile(item.paths.partial);
        return 'missing';
      }
    }
    return 'ready';
  });
}

async function pairStorageIsEnough(io: ModelTransferIO, items: readonly PinnedTransferItem[]): Promise<boolean> {
  const available = await io.availableBytes();
  let needed = SCRAP_MODEL_STORAGE_MARGIN_BYTES;
  let reclaim = 0;
  for (const item of items) {
    const partial = (await io.fileSize(item.paths.partial)) ?? 0;
    const finalSize = (await io.fileSize(item.paths.final)) ?? 0;
    reclaim += partial;
    if (finalSize === item.pin.bytes) continue;
    needed += item.pin.bytes;
    reclaim += finalSize;
  }
  return available + reclaim >= needed;
}

async function transferPinnedFile(
  io: ModelTransferIO,
  pin: ScrapModelPin,
  paths: ModelTransferPaths,
  onProgress?: (update: ModelTransferProgress) => void,
  cancel?: { cancelled: () => boolean; bind: (cancel: () => void) => void },
  chunkBytes?: number,
  skipStorageCheck = false,
): Promise<string> {
  const existing = await verifyPinnedFile(io, pin, paths, onProgress, cancel?.cancelled, chunkBytes);
  if (existing === 'ready') return paths.final;
  if (existing === 'invalid') {
    await io.deleteFile(paths.final);
    await io.deleteFile(paths.receipt);
  }
  if (!skipStorageCheck && !(await storageIsEnough(io, pin, paths))) {
    throw new ScrapStorageError(pin.bytes + SCRAP_MODEL_STORAGE_MARGIN_BYTES);
  }
  await io.deleteFile(paths.partial);
  try {
    if (cancel?.cancelled()) throw new ScrapTransferCancelledError();
    await io.download({
      url: pin.url,
      destination: paths.partial,
      onProgress: (written, total) => {
        const expected = total > 0 ? total : pin.bytes;
        onProgress?.(progress('download', written, expected));
      },
      bindCancel: (nativeCancel) => cancel?.bind(nativeCancel),
    });
    if (cancel?.cancelled()) throw new ScrapTransferCancelledError();
    const saved = await io.fileSize(paths.partial);
    if (saved !== pin.bytes) throw new ScrapChecksumError();
    const hash = await hashStoredFile(io, paths.partial, pin.bytes, onProgress, cancel?.cancelled, chunkBytes);
    if (cancel?.cancelled()) throw new ScrapTransferCancelledError();
    if (hash !== pin.sha256) throw new ScrapChecksumError();
    await io.moveFile(paths.partial, paths.final);
    const stamp = await io.fileStamp(paths.final);
    const receipt: ModelReceipt = {
      bytes: pin.bytes,
      sha256: pin.sha256,
      revision: pin.revision,
      modified: stamp,
    };
    await io.writeText(paths.receipt, JSON.stringify(receipt));
    onProgress?.(progress('verify', pin.bytes, pin.bytes));
    return paths.final;
  } catch (error) {
    await io.deleteFile(paths.partial);
    throw error;
  }
}

export async function inspectPinnedModel(
  io: ModelTransferIO,
  pin: ScrapModelPin,
  paths: ModelTransferPaths,
  onProgress?: (update: ModelTransferProgress) => void,
  chunkBytes?: number,
): Promise<'ready' | 'missing'> {
  return withScrapEngineLock('verify', async () => {
    const status = await verifyPinnedFile(io, pin, paths, onProgress, undefined, chunkBytes);
    if (status === 'invalid') {
      await io.deleteFile(paths.final);
      await io.deleteFile(paths.receipt);
      await io.deleteFile(paths.partial);
      return 'missing';
    }
    if (status === 'missing') {
      await io.deleteFile(paths.partial);
    }
    return status;
  });
}

export async function deletePinnedModel(io: ModelTransferIO, paths: ModelTransferPaths): Promise<void> {
  return withScrapEngineLock('delete', async () => {
    await io.deleteFile(paths.final);
    await io.deleteFile(paths.partial);
    await io.deleteFile(paths.receipt);
  });
}

type MemoryEntry = { bytes: Uint8Array; stamp: number };

export function createMemoryTransferIO(options?: { available?: number }) {
  const files = new Map<string, MemoryEntry>();
  let available = options?.available ?? 8 * 1024 * 1024 * 1024;
  let clock = 1;
  let downloadBody: ((args: {
    destination: string;
    onProgress: (written: number, total: number) => void;
    cancelled: () => boolean;
  }) => Promise<Uint8Array>) | null = null;
  const events: string[] = [];

  const io: ModelTransferIO = {
    availableBytes: () => available,
    fileSize: (path) => files.get(path)?.bytes.length ?? null,
    fileStamp: (path) => files.get(path)?.stamp ?? null,
    readChunk: (path, offset, length) => {
      events.push(`read:${path}:${offset}`);
      const entry = files.get(path);
      if (!entry) throw new ScrapChecksumError();
      return entry.bytes.slice(offset, offset + length);
    },
    deleteFile: (path) => {
      events.push(`delete:${path}`);
      files.delete(path);
    },
    moveFile: (from, to) => {
      events.push(`move:${from}:${to}`);
      const entry = files.get(from);
      if (!entry) throw new ScrapChecksumError();
      files.delete(from);
      clock += 1;
      files.set(to, { bytes: entry.bytes, stamp: clock });
    },
    readText: (path) => {
      const entry = files.get(path);
      if (!entry) return null;
      return new TextDecoder().decode(entry.bytes);
    },
    writeText: (path, text) => {
      clock += 1;
      files.set(path, { bytes: new TextEncoder().encode(text), stamp: clock });
    },
    download: async ({ destination, onProgress, bindCancel }) => {
      events.push(`download:${destination}`);
      let nativeCancel = () => {};
      let cancelled = false;
      bindCancel(() => {
        cancelled = true;
        nativeCancel();
      });
      nativeCancel = () => {
        cancelled = true;
      };
      if (!downloadBody) throw new Error('No download body was set.');
      const bytes = await downloadBody({
        destination,
        onProgress,
        cancelled: () => cancelled,
      });
      if (cancelled) throw new ScrapTransferCancelledError();
      clock += 1;
      files.set(destination, { bytes, stamp: clock });
    },
  };

  return {
    io,
    events,
    put(path: string, bytes: Uint8Array) {
      clock += 1;
      files.set(path, { bytes, stamp: clock });
    },
    setAvailable(bytes: number) {
      available = bytes;
    },
    setDownload(body: NonNullable<typeof downloadBody>) {
      downloadBody = body;
    },
    has(path: string) {
      return files.has(path);
    },
  };
}
