/**
 * Capture a progress still.
 *
 * Native opens the camera or the photo library. Web opens the browser camera
 * or a file picker. Web files are resized before they are stored so a handful
 * of stills fit in localStorage next to the rest of the project.
 */
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

const MAX_EDGE = 1280;
const MAX_DATA_URL = 1_000_000;

export type CaptureSource = 'camera' | 'library';

export type CaptureResult =
  | { status: 'ok'; uri: string }
  | { status: 'canceled' }
  | { status: 'error'; reason: 'denied' | 'unavailable' | 'too-large' };

export async function captureProgressPhoto(source: CaptureSource): Promise<CaptureResult> {
  try {
    if (Platform.OS !== 'web') {
      const permission =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) return { status: 'error', reason: 'denied' };
    }

    const options = {
      mediaTypes: ['images'] as ImagePicker.MediaType[],
      quality: 0.3,
      base64: true,
      exif: false,
    };
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ ...options, cameraType: ImagePicker.CameraType.back })
        : await ImagePicker.launchImageLibraryAsync(options);

    if (result.canceled || !result.assets[0]) return { status: 'canceled' };
    const uri = await photoUriFromAsset(result.assets[0]);
    if (!uri) return { status: 'error', reason: 'too-large' };
    return { status: 'ok', uri };
  } catch {
    return { status: 'error', reason: 'unavailable' };
  }
}

export function captureErrorMessage(reason: 'denied' | 'unavailable' | 'too-large', source: CaptureSource): string {
  if (reason === 'denied') {
    return source === 'camera'
      ? 'Camera access is off. Allow it in Settings, or upload a photo instead.'
      : 'Photo library access is off. Allow it in Settings, or take a photo instead.';
  }
  if (reason === 'too-large') return 'That photo is too large to keep. Try another one.';
  return source === 'camera'
    ? 'The camera is not available here. Upload a photo instead.'
    : 'That photo could not be opened. Try another one.';
}

async function photoUriFromAsset(asset: ImagePicker.ImagePickerAsset): Promise<string | null> {
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const compressed = await compressWebAsset(asset);
    if (compressed && compressed.length <= MAX_DATA_URL) return compressed;
    return null;
  }

  if (asset.base64) {
    const mime = asset.mimeType?.startsWith('image/') ? asset.mimeType : 'image/jpeg';
    const uri = `data:${mime};base64,${asset.base64}`;
    if (uri.length <= MAX_DATA_URL) return uri;
  }

  if (asset.uri && (asset.uri.startsWith('file://') || asset.uri.startsWith('content://') || asset.uri.startsWith('ph://'))) {
    return asset.uri;
  }
  return null;
}

async function compressWebAsset(asset: ImagePicker.ImagePickerAsset): Promise<string | null> {
  const blob = asset.file ?? (await (await fetch(asset.uri)).blob());
  const image = await loadImage(blob);
  const longest = Math.max(image.naturalWidth, image.naturalHeight) || 1;
  const scale = longest > MAX_EDGE ? MAX_EDGE / longest : 1;
  const width = Math.max(1, Math.round((image.naturalWidth || MAX_EDGE) * scale));
  const height = Math.max(1, Math.round((image.naturalHeight || MAX_EDGE) * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.drawImage(image, 0, 0, width, height);
  const url = canvas.toDataURL('image/jpeg', 0.72);
  return url.startsWith('data:image/') ? url : null;
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = document.createElement('img');
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that image.'));
    };
    image.src = url;
  });
}
