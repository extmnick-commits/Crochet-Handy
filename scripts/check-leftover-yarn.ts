/**
 * Leftover yarn regression checks.
 * Run with: npx tsx scripts/check-leftover-yarn.ts
 *
 * Photo decoding, native crops, and device modal transitions are not covered here.
 */
import {
  catalogPreviewDecision,
  closeCatalogPreview,
  closeLeftoverScrap,
  displayThumbnail,
  generatedIdeaThumbnail,
  idleCatalogPreview,
  libraryAfterPreview,
  openLeftoverScrap,
  previewDismissed,
  recommendationThumbnail,
  requestCatalogPreview,
  scrapDismissed,
} from '../utils/catalogPreview';
import {
  applySampledColors,
  editLeftoverColors,
  getLeftoverYarnDraft,
  leftoverYarnSnapshot,
  replaceLeftoverPhoto,
  resetLeftoverYarnDraft,
  setLeftoverImageSize,
  setLeftoverRegions,
  stampLeftoverExtraction,
  updateLeftoverYarnDraft,
} from '../utils/leftoverYarnDraft';
import { colorsFromRegionPixels, yarnCropSampleHtml } from '../utils/yarnColorMath';
import {
  containImageRect,
  framePointToImageNorm,
  frameTouchToPixel,
  orientedDisplaySize,
  pixelCrop,
  regionAroundNormPoint,
  regionSampleKey,
} from '../utils/yarnRegion';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function equal<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}\n  actual:   ${String(actual)}\n  expected: ${String(expected)}`);
  }
}

type Rgb = [number, number, number];

function blank(width: number, height: number, color: Rgb): Rgb[] {
  return Array.from({ length: width * height }, () => [...color] as Rgb);
}

function fill(pixels: Rgb[], width: number, x: number, y: number, w: number, h: number, color: Rgb) {
  for (let row = y; row < y + h; row += 1) {
    for (let column = x; column < x + w; column += 1) {
      pixels[row * width + column] = [...color] as Rgb;
    }
  }
}

function names(colors: { name: string; family: string }[]): string {
  return colors.map((color) => `${color.name}/${color.family}`).join(', ');
}

function main() {
  checkRegionColors();
  checkCoordinates();
  checkProbeHtml();
  checkThumbnails();
  checkSessionAndPreview();
  console.log('leftover yarn checks passed');
}

function checkRegionColors() {
  const blue: Rgb = [46, 74, 158];
  const red: Rgb = [196, 30, 58];
  const green: Rgb = [76, 187, 23];
  const white: Rgb = [247, 247, 245];
  const black: Rgb = [26, 26, 26];
  const pale: Rgb = [243, 230, 200];
  const gray: Rgb = [142, 142, 147];
  const lightRed: Rgb = [224, 112, 128];

  const background = blank(40, 40, blue);
  fill(background, 40, 8, 8, 12, 12, red);
  const yarnOnly = colorsFromRegionPixels(40, 40, background, [{ x: 9 / 40, y: 9 / 40, width: 10 / 40, height: 10 / 40 }]);
  assert(yarnOnly.some((color) => color.family === 'Red'), `red yarn on blue, got ${names(yarnOnly)}`);
  assert(!yarnOnly.some((color) => color.family === 'Blue'), `background leaked, got ${names(yarnOnly)}`);
  equal(colorsFromRegionPixels(40, 40, background, []).length, 0, 'no region does not sample the photo');

  const whitePhoto = blank(30, 30, blue);
  fill(whitePhoto, 30, 6, 6, 16, 16, white);
  const whiteYarn = colorsFromRegionPixels(30, 30, whitePhoto, [{ x: 8 / 30, y: 8 / 30, width: 12 / 30, height: 12 / 30 }]);
  assert(whiteYarn.some((color) => color.family === 'Neutral' && /white|ivory|cream/i.test(color.name)), `white yarn, got ${names(whiteYarn)}`);
  assert(!whiteYarn.some((color) => color.family === 'Blue'), `white yarn picked up blue, got ${names(whiteYarn)}`);

  const blackPhoto = blank(30, 30, white);
  fill(blackPhoto, 30, 6, 6, 16, 16, black);
  const blackYarn = colorsFromRegionPixels(30, 30, blackPhoto, [{ x: 8 / 30, y: 8 / 30, width: 12 / 30, height: 12 / 30 }]);
  assert(blackYarn.some((color) => color.name === 'Black'), `black yarn, got ${names(blackYarn)}`);

  const palePhoto = blank(30, 30, blue);
  fill(palePhoto, 30, 6, 6, 16, 16, pale);
  const paleYarn = colorsFromRegionPixels(30, 30, palePhoto, [{ x: 8 / 30, y: 8 / 30, width: 12 / 30, height: 12 / 30 }]);
  assert(paleYarn.some((color) => color.family === 'Neutral'), `pale yarn, got ${names(paleYarn)}`);
  assert(!paleYarn.some((color) => color.family === 'Blue'), `pale yarn picked up blue, got ${names(paleYarn)}`);

  const grayPhoto = blank(30, 30, red);
  fill(grayPhoto, 30, 6, 6, 16, 16, gray);
  const grayYarn = colorsFromRegionPixels(30, 30, grayPhoto, [{ x: 8 / 30, y: 8 / 30, width: 12 / 30, height: 12 / 30 }]);
  assert(grayYarn.some((color) => color.name === 'Gray' || color.name === 'Silver'), `gray yarn, got ${names(grayYarn)}`);
  assert(!grayYarn.some((color) => color.family === 'Red'), `gray yarn picked up red, got ${names(grayYarn)}`);

  const variegated = blank(20, 20, red);
  fill(variegated, 20, 10, 0, 10, 20, blue);
  const both = colorsFromRegionPixels(20, 20, variegated, [{ x: 0, y: 0, width: 1, height: 1 }]);
  assert(both.some((color) => color.family === 'Red') && both.some((color) => color.family === 'Blue'), `multicolor yarn, got ${names(both)}`);

  const lit = blank(24, 24, red);
  fill(lit, 24, 8, 0, 16, 24, lightRed);
  const merged = colorsFromRegionPixels(24, 24, lit, [{ x: 0, y: 0, width: 1, height: 1 }]);
  equal(merged.length, 1, `lighting duplicates, got ${names(merged)}`);

  const multi = blank(40, 40, blue);
  fill(multi, 40, 2, 2, 10, 10, red);
  fill(multi, 40, 26, 26, 10, 10, green);
  const twoBalls = colorsFromRegionPixels(40, 40, multi, [
    { x: 3 / 40, y: 3 / 40, width: 8 / 40, height: 8 / 40 },
    { x: 27 / 40, y: 27 / 40, width: 8 / 40, height: 8 / 40 },
  ]);
  assert(twoBalls.some((color) => color.family === 'Red'), `first ball, got ${names(twoBalls)}`);
  assert(twoBalls.some((color) => color.family === 'Green'), `second ball, got ${names(twoBalls)}`);
  assert(!twoBalls.some((color) => color.family === 'Blue'), `two regions picked up the table, got ${names(twoBalls)}`);
}

function checkCoordinates() {
  equal(orientedDisplaySize(3000, 4000, 1).width, 3000, 'orientation 1 width');
  equal(orientedDisplaySize(3000, 4000, 3).height, 4000, 'orientation 3 keeps size');
  equal(orientedDisplaySize(3000, 4000, 6).width, 4000, 'orientation 6 swaps width');
  equal(orientedDisplaySize(3000, 4000, 8).height, 3000, 'orientation 8 swaps height');
  const oriented = orientedDisplaySize(3000, 4000, 6);
  const orientedCrop = pixelCrop({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 }, oriented.width, oriented.height);
  equal(orientedCrop.originX, 1000, 'oriented crop x');
  equal(orientedCrop.originY, 750, 'oriented crop y');
  equal(orientedCrop.width, 2000, 'oriented crop width');
  equal(orientedCrop.height, 1500, 'oriented crop height');

  const portrait = containImageRect(300, 300, 800, 1000);
  equal(portrait.x, 30, 'portrait letterbox x');
  equal(portrait.y, 0, 'portrait letterbox y');
  assert(framePointToImageNorm(10, 10, 300, 300, 800, 1000) == null, 'portrait letterbox tap');
  const portraitCenter = framePointToImageNorm(150, 150, 300, 300, 800, 1000);
  equal(portraitCenter?.x, 0.5, 'portrait center x');
  equal(portraitCenter?.y, 0.5, 'portrait center y');

  assert(framePointToImageNorm(100, 10, 200, 400, 1600, 900) == null, 'landscape letterbox tap');
  const landscapeCenter = framePointToImageNorm(100, 200, 200, 400, 1600, 900);
  equal(landscapeCenter?.x, 0.5, 'landscape center x');
  equal(landscapeCenter?.y, 0.5, 'landscape center y');

  const square = framePointToImageNorm(0, 0, 200, 200, 200, 200);
  equal(square?.x, 0, 'square origin x');
  equal(square?.y, 0, 'square origin y');

  const fourFive = containImageRect(200, 250, 800, 1000);
  equal(fourFive.x, 0, '4:5 has no side bar');
  equal(fourFive.y, 0, '4:5 has no top bar');

  const wideInTall = framePointToImageNorm(90, 160, 180, 320, 1600, 900);
  equal(wideInTall?.x, 0.5, '16:9 in 9:16 x');
  equal(wideInTall?.y, 0.5, '16:9 in 9:16 y');

  const pixel = frameTouchToPixel(10, 35, 100, 100, 100, 50);
  equal(pixel?.x, 10, 'touch maps to yarn pixel x');
  equal(pixel?.y, 10, 'touch maps to yarn pixel y');
  const mapped = blank(100, 50, bluePixel());
  mapped[10 * 100 + 10] = [196, 30, 58];
  const sampled = colorsFromRegionPixels(100, 50, mapped, [{ x: 10 / 100, y: 10 / 50, width: 1 / 100, height: 1 / 50 }]);
  assert(sampled.some((color) => color.family === 'Red'), `mapped tap missed the yarn, got ${names(sampled)}`);
  assert(!sampled.some((color) => color.family === 'Blue'), `mapped tap included the table, got ${names(sampled)}`);
}

function bluePixel(): Rgb {
  return [46, 74, 158];
}

function checkProbeHtml() {
  const empty = yarnCropSampleHtml([]);
  assert(empty.includes('if (!sources.length) { post([]); }'), 'empty selection posts no pixels');
  assert(!empty.includes('file://'), 'empty selection has no photo');
  const cropped = yarnCropSampleHtml(['file://yarn-crop-a.jpg', 'file://yarn-crop-b.jpg']);
  assert(cropped.includes('file://yarn-crop-a.jpg') && cropped.includes('file://yarn-crop-b.jpg'), 'probe lists each crop');
  assert(!cropped.includes('drawImage(img, 0, 0, img.width'), 'probe does not draw an uncropped frame');
}

function checkThumbnails() {
  const stored = recommendationThumbnail({
    thumbnailUrl: 'https://i.ytimg.com/vi/abcdefghijk/maxresdefault.jpg',
    videoId: 'abcdefghijk',
  });
  equal(stored.source, 'stored', 'stored thumbnail wins');
  equal(stored.uri, 'https://i.ytimg.com/vi/abcdefghijk/maxresdefault.jpg', 'stored uri');

  const poster = recommendationThumbnail({ thumbnailUrl: '', videoId: 'abcdefghijk' });
  equal(poster.source, 'youtube', 'youtube poster fallback');
  assert(poster.uri?.includes('hqdefault.jpg'), 'hq poster');

  const missing = recommendationThumbnail({ thumbnailUrl: 'not a url', videoId: 'short' });
  equal(missing.source, 'none', 'broken id has no thumbnail');
  equal(generatedIdeaThumbnail(), null, 'ideas do not borrow a tutorial image');
  equal(displayThumbnail('https://example.com/thumb.jpg', true), null, 'broken image uses the fallback');
  equal(displayThumbnail('https://example.com/thumb.jpg', false), 'https://example.com/thumb.jpg', 'loaded image stays');
  equal(displayThumbnail(null, false), null, 'missing image uses the fallback');
}

function checkSessionAndPreview() {
  resetLeftoverYarnDraft();
  replaceLeftoverPhoto('file://yarn.jpg');
  setLeftoverImageSize(800, 1000);
  setLeftoverRegions([regionAroundNormPoint('ball', 0.4, 0.5)]);
  editLeftoverColors([{ name: 'Cream', hex: '#F4F1DE' }]);
  updateLeftoverYarnDraft({
    weight: 'dk',
    yardsText: '40',
    scrollY: 240,
    aiResult: {
      key: 'Cream:#F4F1DE|dk|40',
      result: {
        source: 'offline-rules',
        ideas: [],
        catalog: [],
        patterns: [],
        note: 'kept',
      },
    },
  });
  const before = leftoverYarnSnapshot();
  const sampleKey = regionSampleKey(before.photoGeneration, before.regions);

  let flow = openLeftoverScrap(idleCatalogPreview());
  flow = requestCatalogPreview(flow, { id: 'tutorial-a' });
  flow = scrapDismissed(flow);
  equal(flow.phase, 'preview', 'first preview opens after the sheet dismisses');
  flow = closeCatalogPreview(flow);
  flow = previewDismissed(flow);
  equal(flow.phase, 'scrap', 'back returns to the yarn sheet');

  flow = requestCatalogPreview(flow, { id: 'tutorial-b' });
  const rapid = requestCatalogPreview(flow, { id: 'tutorial-c' });
  equal(rapid.pattern?.id, 'tutorial-b', 'a second tap keeps the preview already opening');
  flow = scrapDismissed(rapid);
  flow = closeCatalogPreview(flow);
  flow = previewDismissed(flow);
  equal(JSON.stringify(leftoverYarnSnapshot()), JSON.stringify(before), 'preview leaves the yarn session unchanged');
  equal(before.sampledKey, sampleKey, 'manual colors stay tied to the same selection');

  let library = ['saved-pattern'];
  library = libraryAfterPreview(library, 'tutorial-a', 'preview');
  library = libraryAfterPreview(library, 'tutorial-a', 'back');
  equal(library.join(','), 'saved-pattern', 'preview does not save');
  library = libraryAfterPreview(library, 'tutorial-a', 'save');
  equal(library.join(','), 'saved-pattern,tutorial-a', 'save adds the pattern once');
  library = libraryAfterPreview(library, 'tutorial-a', 'start');
  equal(library.join(','), 'saved-pattern,tutorial-a', 'start does not duplicate a saved pattern');
  equal(libraryAfterPreview(['saved-pattern'], 'fresh-pattern', 'start').join(','), 'saved-pattern,fresh-pattern', 'start saves a new pattern');
  equal(catalogPreviewDecision('preview').importPattern, false, 'preview decision');
  equal(catalogPreviewDecision('start').startProject, true, 'start decision');

  const stamp = stampLeftoverExtraction();
  const blocked = applySampledColors(getLeftoverYarnDraft(), stamp, [{ name: 'Navy', hex: '#2C3E6B' }]);
  equal(blocked, null, 'a late sample does not replace a manual color');
  equal(getLeftoverYarnDraft().colors[0]?.name, 'Cream', 'manual cream remains');

  const generation = getLeftoverYarnDraft().photoGeneration;
  replaceLeftoverPhoto('file://other.jpg');
  const replaced = getLeftoverYarnDraft();
  equal(replaced.photoUri, 'file://other.jpg', 'new photo');
  equal(replaced.regions.length, 0, 'new photo clears regions');
  equal(replaced.colors.length, 0, 'new photo clears colors');
  equal(replaced.aiResult, null, 'new photo clears suggestions');
  equal(replaced.weight, 'dk', 'new photo keeps the weight');
  equal(replaced.yardsText, '40', 'new photo keeps the yards');
  assert(replaced.photoGeneration > generation, 'new photo bumps the generation');
  equal(
    applySampledColors(replaced, stamp, [{ name: 'Kelly Green', hex: '#4CBB17' }]),
    null,
    'a sample from the previous photo is dropped',
  );

  const closed = closeLeftoverScrap(flow);
  equal(closed.phase, 'idle', 'closing the sheet is not a new scan');
  equal(getLeftoverYarnDraft().photoUri, 'file://other.jpg', 'closing keeps the photo in memory');
  resetLeftoverYarnDraft();
  equal(getLeftoverYarnDraft().photoUri, null, 'start over clears the session');
}

main();
