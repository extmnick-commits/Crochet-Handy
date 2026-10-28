import { NativeModule, requireOptionalNativeModule } from 'expo';

export const SCRAP_FILE_HASH_CANCELLED = 'ERR_SCRAP_HASH_CANCELLED';

type HashProgressEvent = {
  requestId: string;
  hashed: number;
  total: number;
};

type ScrapFileHashEvents = {
  hashProgress(event: HashProgressEvent): void;
};

declare class ScrapFileHashNativeModule extends NativeModule<ScrapFileHashEvents> {
  hashFileSha256(requestId: string, uri: string): Promise<string>;
  cancelHash(requestId: string): void;
  keyboardFrame?(enabled: boolean): Promise<{ height: number; screenY: number } | null>;
}

const native = requireOptionalNativeModule<ScrapFileHashNativeModule>('ScrapFileHash');

export async function androidKeyboardFrame(): Promise<{ height: number; screenY: number } | null> {
  return native?.keyboardFrame ? native.keyboardFrame(true) : null;
}

let nextRequestId = 0;
let warnedMissing = false;

export function isScrapFileHashCancelled(error: unknown): boolean {
  return !!error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === SCRAP_FILE_HASH_CANCELLED;
}

function cancelledError(): Error {
  const error = new Error('The file hash was cancelled.');
  (error as Error & { code: string }).code = SCRAP_FILE_HASH_CANCELLED;
  return error;
}

function noteMissingNativeHash(): void {
  if (warnedMissing || typeof __DEV__ === 'undefined' || !__DEV__) return;
  warnedMissing = true;
  console.warn(
    'Native file SHA-256 is not in this app binary. Model verification is using JavaScript until the next iOS or Android rebuild.',
  );
}

/** Lowercase SHA-256 of a local file. Returns null when this binary has no native module. */
export async function hashFileSha256(
  uri: string,
  options?: {
    onHashed?: (hashedBytes: number) => void;
    cancelled?: () => boolean;
  },
): Promise<string | null> {
  if (!native) {
    noteMissingNativeHash();
    return null;
  }
  if (options?.cancelled?.()) throw cancelledError();

  const requestId = `scrap-hash-${(nextRequestId += 1)}`;
  const subscription = native.addListener('hashProgress', (event) => {
    if (event.requestId !== requestId) return;
    if (typeof event.hashed === 'number') options?.onHashed?.(event.hashed);
  });
  const timer = setInterval(() => {
    if (options?.cancelled?.()) native.cancelHash(requestId);
  }, 200);

  try {
    const hash = await native.hashFileSha256(requestId, uri);
    if (options?.cancelled?.()) throw cancelledError();
    return hash;
  } catch (error) {
    if (isScrapFileHashCancelled(error) || options?.cancelled?.()) throw cancelledError();
    throw error;
  } finally {
    clearInterval(timer);
    subscription.remove();
  }
}
