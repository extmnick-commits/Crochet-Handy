/**
 * Shrink a leftover photo before it is handed to the vision model.
 * The resized JPEG stays in local cache. It is not uploaded.
 */
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Image } from 'react-native';

import { VISION_PHOTO_LONG_EDGE } from '@/utils/scrapVisionSession';

const LONG_EDGE = VISION_PHOTO_LONG_EDGE;

export async function prepareVisionPhoto(uri: string): Promise<string> {
  const size = await readImageSize(uri);
  const actions = size ? resizeActions(size.width, size.height) : [{ resize: { width: LONG_EDGE } }];
  const result = await manipulateAsync(uri, actions, { compress: 0.85, format: SaveFormat.JPEG });
  if (!result.uri) throw new Error('The photo could not be prepared.');
  return result.uri.startsWith('file://') || result.uri.startsWith('data:') ? result.uri : `file://${result.uri}`;
}

function resizeActions(width: number, height: number): { resize: { width?: number; height?: number } }[] {
  const longEdge = Math.max(width, height);
  if (longEdge <= LONG_EDGE) return [];
  if (width >= height) return [{ resize: { width: LONG_EDGE } }];
  return [{ resize: { height: LONG_EDGE } }];
}

function readImageSize(uri: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    Image.getSize(
      uri,
      (width, height) => {
        if (width > 0 && height > 0) resolve({ width, height });
        else resolve(null);
      },
      () => resolve(null),
    );
  });
}
