/**
 * Shrink a leftover photo before it is handed to the vision model.
 * The resized JPEG stays in local cache. It is not uploaded.
 */
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Image } from 'react-native';
import { VISION_SCAN_PROFILES, type VisionScanDetail } from '@/utils/scrapVisionConfig';

export async function prepareVisionPhoto(uri: string, detail: VisionScanDetail = 'quick'): Promise<string> {
  const longEdge = VISION_SCAN_PROFILES[detail].longEdge;
  const size = await readImageSize(uri);
  const actions = size ? resizeActions(size.width, size.height, longEdge) : [{ resize: { width: longEdge } }];
  const result = await manipulateAsync(uri, actions, { compress: 0.85, format: SaveFormat.JPEG });
  if (!result.uri) throw new Error('The photo could not be prepared.');
  return result.uri.startsWith('file://') || result.uri.startsWith('data:') ? result.uri : `file://${result.uri}`;
}

function resizeActions(width: number, height: number, limit: number): { resize: { width?: number; height?: number } }[] {
  const longEdge = Math.max(width, height);
  if (longEdge <= limit) return [];
  if (width >= height) return [{ resize: { width: limit } }];
  return [{ resize: { height: limit } }];
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
