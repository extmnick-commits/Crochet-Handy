/**
 * Yarn-region geometry.
 *
 * Coordinates are normalized (0–1) on the oriented bitmap the photo view
 * reports. Touch points are mapped through the contain-fit rectangle so
 * letterboxing is not part of the sample. Empty selections sample nothing.
 */

export type NormRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type YarnSampleRegion = NormRect & {
  id: string;
};

export type PixelCrop = {
  originX: number;
  originY: number;
  width: number;
  height: number;
};

export type FrameBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se';

const MIN_NORM = 0.08;

/** EXIF orientations 5–8 swap the displayed width and height. */
export function orientedDisplaySize(
  width: number,
  height: number,
  orientation: number,
): { width: number; height: number } {
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  const swapped = orientation === 5 || orientation === 6 || orientation === 7 || orientation === 8;
  return swapped ? { width: safeHeight, height: safeWidth } : { width: safeWidth, height: safeHeight };
}

/** Image rectangle inside a contain-fitted frame, in frame pixels. */
export function containImageRect(
  frameWidth: number,
  frameHeight: number,
  imageWidth: number,
  imageHeight: number,
): FrameBox {
  const frameW = Math.max(1, frameWidth);
  const frameH = Math.max(1, frameHeight);
  const imageW = Math.max(1, imageWidth);
  const imageH = Math.max(1, imageHeight);
  const scale = Math.min(frameW / imageW, frameH / imageH);
  const width = imageW * scale;
  const height = imageH * scale;
  return {
    x: (frameW - width) / 2,
    y: (frameH - height) / 2,
    width,
    height,
  };
}

/** Map a frame touch to oriented image coordinates. Letterbox taps return null. */
export function framePointToImageNorm(
  pointX: number,
  pointY: number,
  frameWidth: number,
  frameHeight: number,
  imageWidth: number,
  imageHeight: number,
): { x: number; y: number } | null {
  const box = containImageRect(frameWidth, frameHeight, imageWidth, imageHeight);
  if (pointX < box.x || pointY < box.y || pointX > box.x + box.width || pointY > box.y + box.height) {
    return null;
  }
  return {
    x: clamp01((pointX - box.x) / box.width),
    y: clamp01((pointY - box.y) / box.height),
  };
}

export function frameTouchToPixel(
  pointX: number,
  pointY: number,
  frameWidth: number,
  frameHeight: number,
  imageWidth: number,
  imageHeight: number,
): { x: number; y: number } | null {
  const norm = framePointToImageNorm(pointX, pointY, frameWidth, frameHeight, imageWidth, imageHeight);
  if (!norm) return null;
  const width = Math.max(1, Math.round(imageWidth));
  const height = Math.max(1, Math.round(imageHeight));
  return {
    x: Math.min(width - 1, Math.floor(norm.x * width)),
    y: Math.min(height - 1, Math.floor(norm.y * height)),
  };
}

export function frameDeltaToImageNorm(
  deltaX: number,
  deltaY: number,
  frameWidth: number,
  frameHeight: number,
  imageWidth: number,
  imageHeight: number,
): { x: number; y: number } {
  const box = containImageRect(frameWidth, frameHeight, imageWidth, imageHeight);
  return {
    x: deltaX / Math.max(1, box.width),
    y: deltaY / Math.max(1, box.height),
  };
}

export function imageNormRectToFrame(
  region: NormRect,
  frameWidth: number,
  frameHeight: number,
  imageWidth: number,
  imageHeight: number,
): FrameBox {
  const box = containImageRect(frameWidth, frameHeight, imageWidth, imageHeight);
  return {
    x: box.x + region.x * box.width,
    y: box.y + region.y * box.height,
    width: region.width * box.width,
    height: region.height * box.height,
  };
}

export function regionAroundNormPoint(id: string, x: number, y: number, fraction = 0.34): YarnSampleRegion {
  const size = Math.min(0.72, Math.max(MIN_NORM, fraction));
  return clampRegion({
    id,
    x: x - size / 2,
    y: y - size / 2,
    width: size,
    height: size,
  });
}

export function clampRegion(region: YarnSampleRegion): YarnSampleRegion {
  const width = clamp(region.width, MIN_NORM, 1);
  const height = clamp(region.height, MIN_NORM, 1);
  return {
    ...region,
    width,
    height,
    x: clamp(region.x, 0, 1 - width),
    y: clamp(region.y, 0, 1 - height),
  };
}

export function moveRegion(region: YarnSampleRegion, deltaX: number, deltaY: number): YarnSampleRegion {
  return clampRegion({ ...region, x: region.x + deltaX, y: region.y + deltaY });
}

export function resizeRegion(
  region: YarnSampleRegion,
  handle: ResizeHandle,
  deltaX: number,
  deltaY: number,
): YarnSampleRegion {
  let { x, y, width, height } = region;
  if (handle === 'nw' || handle === 'sw') {
    x += deltaX;
    width -= deltaX;
  } else {
    width += deltaX;
  }
  if (handle === 'nw' || handle === 'ne') {
    y += deltaY;
    height -= deltaY;
  } else {
    height += deltaY;
  }
  return clampRegion({ ...region, x, y, width, height });
}

export function regionAtNormPoint(
  regions: readonly YarnSampleRegion[],
  x: number,
  y: number,
): YarnSampleRegion | null {
  for (let index = regions.length - 1; index >= 0; index -= 1) {
    const region = regions[index];
    if (!region) continue;
    if (x >= region.x && y >= region.y && x <= region.x + region.width && y <= region.y + region.height) {
      return region;
    }
  }
  return null;
}

export function hitTestRegionFrame(
  pointX: number,
  pointY: number,
  frame: FrameBox,
  handlePx = 22,
): 'move' | ResizeHandle | null {
  if (frame.width <= 0 || frame.height <= 0) return null;
  const corners: { id: ResizeHandle; x: number; y: number }[] = [
    { id: 'nw', x: frame.x, y: frame.y },
    { id: 'ne', x: frame.x + frame.width, y: frame.y },
    { id: 'sw', x: frame.x, y: frame.y + frame.height },
    { id: 'se', x: frame.x + frame.width, y: frame.y + frame.height },
  ];
  for (const corner of corners) {
    if (Math.abs(pointX - corner.x) <= handlePx && Math.abs(pointY - corner.y) <= handlePx) return corner.id;
  }
  if (
    pointX >= frame.x &&
    pointY >= frame.y &&
    pointX <= frame.x + frame.width &&
    pointY <= frame.y + frame.height
  ) {
    return 'move';
  }
  return null;
}

/** Integer crop in oriented image pixels. A zero-area region still yields at least one pixel. */
export function pixelCrop(region: NormRect, imageWidth: number, imageHeight: number): PixelCrop {
  const width = Math.max(1, Math.round(imageWidth));
  const height = Math.max(1, Math.round(imageHeight));
  const left = clamp01(region.x);
  const top = clamp01(region.y);
  const right = clamp01(region.x + region.width);
  const bottom = clamp01(region.y + region.height);
  const originX = Math.min(width - 1, Math.max(0, Math.floor(left * width)));
  const originY = Math.min(height - 1, Math.max(0, Math.floor(top * height)));
  const endX = Math.min(width, Math.max(originX + 1, Math.ceil(right * width)));
  const endY = Math.min(height, Math.max(originY + 1, Math.ceil(bottom * height)));
  return { originX, originY, width: endX - originX, height: endY - originY };
}

/** Pixels inside the selected regions only. No regions means no pixels. */
export function pixelsInRegions(
  width: number,
  height: number,
  pixels: readonly (readonly [number, number, number])[],
  regions: readonly NormRect[],
): [number, number, number][] {
  if (regions.length === 0 || width < 1 || height < 1) return [];
  const chosen: [number, number, number][] = [];
  for (const region of regions) {
    const crop = pixelCrop(region, width, height);
    for (let y = crop.originY; y < crop.originY + crop.height; y += 1) {
      for (let x = crop.originX; x < crop.originX + crop.width; x += 1) {
        const pixel = pixels[y * width + x];
        if (!pixel) continue;
        chosen.push([pixel[0], pixel[1], pixel[2]]);
      }
    }
  }
  return chosen;
}

export function regionSampleKey(photoGeneration: number, regions: readonly YarnSampleRegion[]): string {
  const body = [...regions]
    .map(
      (region) =>
        `${region.id}:${region.x.toFixed(4)}:${region.y.toFixed(4)}:${region.width.toFixed(4)}:${region.height.toFixed(4)}`,
    )
    .sort()
    .join('|');
  return `${photoGeneration}|${body}`;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
