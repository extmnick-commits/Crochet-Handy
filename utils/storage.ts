/**
 * Cross-platform key/value storage for the crochet store.
 *
 * Native uses AsyncStorage. Web uses `localStorage` directly, with an
 * in-memory map behind it when storage is missing (private mode, SSR, or a
 * full disk) so a failed write never crashes the session.
 *
 * Writes are ignored until `enablePersistWrites()` runs. Zustand hydrates
 * asynchronously on device; a tap that lands before that read returns would
 * otherwise overwrite the saved project with the in-memory seed.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import type { StateStorage } from 'zustand/middleware';

export const CROCHET_STORAGE_KEY = 'crochet-handy';
export const CROCHET_STORAGE_VERSION = 1;

const memory = new Map<string, string>();

let persistWritesEnabled = false;

export function enablePersistWrites(): void {
  persistWritesEnabled = true;
}

function readLocal(key: string): string | null {
  try {
    if (typeof localStorage === 'undefined') return memory.get(key) ?? null;
    return localStorage.getItem(key);
  } catch {
    return memory.get(key) ?? null;
  }
}

function writeLocal(key: string, value: string): void {
  memory.set(key, value);
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, value);
    memory.delete(key);
  } catch {
    // Quota exceeded or storage disabled. The memory copy keeps this session alive.
  }
}

function removeLocal(key: string): void {
  memory.delete(key);
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(key);
  } catch {
    // Ignore. The key is already gone from the memory fallback.
  }
}

const webStorage: StateStorage = {
  getItem: (key) => readLocal(key),
  setItem: (key, value) => {
    if (!persistWritesEnabled) return;
    writeLocal(key, value);
  },
  removeItem: (key) => {
    removeLocal(key);
  },
};

const nativeStorage: StateStorage = {
  getItem: async (key) => {
    try {
      return await AsyncStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: async (key, value) => {
    if (!persistWritesEnabled) return;
    try {
      await AsyncStorage.setItem(key, value);
    } catch {
      // Full disk or a native module that isn't ready. Keep the in-memory store.
    }
  },
  removeItem: async (key) => {
    try {
      await AsyncStorage.removeItem(key);
    } catch {
      // Ignore. The next successful write replaces the value.
    }
  },
};

export const crochetStateStorage: StateStorage = Platform.OS === 'web' ? webStorage : nativeStorage;
