/**
 * Capture a progress still.
 *
 * Native opens the camera or the photo library and frames the shot at 4:5
 * (iOS editing crops square, which is the 1:1 fallback). Web opens the browser
 * camera or a file picker, then center-crops to 4:5. Web files are resized
 * before they are stored so a handful of stills fit in localStorage next to
 * the rest of the project.
 */
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

const MAX_EDGE = 1280;
/** Stay under the state machine's photo URI cap so a saved still is never rejected. */
const MAX_DATA_URL = 480_000;
const FRAME_WIDTH = 4;
const FRAME_HEIGHT = 5;

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

    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [FRAME_WIDTH, FRAME_HEIGHT] as [number, number],
      quality: 0.45,
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
    await pulseProgressHaptic('shutter');
    return { status: 'ok', uri };
  } catch {
    return { status: 'error', reason: 'unavailable' };
  }
}

/** Shutter and save ticks. No-ops when the device has no haptics. */
export async function pulseProgressHaptic(kind: 'shutter' | 'save'): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    if (kind === 'shutter') {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  } catch {
    // Haptics are optional. A missing motor should not block the still.
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
  const frame = frame45(image.naturalWidth || MAX_EDGE, image.naturalHeight || MAX_EDGE);
  const canvas = document.createElement('canvas');
  canvas.width = frame.width;
  canvas.height = frame.height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.drawImage(image, frame.sx, frame.sy, frame.sw, frame.sh, 0, 0, frame.width, frame.height);
  for (const quality of [0.72, 0.56, 0.42, 0.3]) {
    const url = canvas.toDataURL('image/jpeg', quality);
    if (url.startsWith('data:image/') && url.length <= MAX_DATA_URL) return url;
  }
  return null;
}

/** Center-crop to 4:5, then scale the long edge down to MAX_EDGE. */
function frame45(sourceWidth: number, sourceHeight: number): { sx: number; sy: number; sw: number; sh: number; width: number; height: number } {
  const target = FRAME_WIDTH / FRAME_HEIGHT;
  const current = sourceWidth / Math.max(1, sourceHeight);
  const sw = current > target ? sourceHeight * target : sourceWidth;
  const sh = current > target ? sourceHeight : sourceWidth / target;
  const longest = Math.max(sw, sh) || 1;
  const scale = longest > MAX_EDGE ? MAX_EDGE / longest : 1;
  return {
    sx: (sourceWidth - sw) / 2,
    sy: (sourceHeight - sh) / 2,
    sw,
    sh,
    width: Math.max(1, Math.round(sw * scale)),
    height: Math.max(1, Math.round(sh * scale)),
  };
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
