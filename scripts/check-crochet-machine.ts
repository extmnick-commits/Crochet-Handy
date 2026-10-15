/**
 * Edge-case checks for the crochet state machine and YouTube parser.
 * Run with: npx tsx scripts/check-crochet-machine.ts
 */
import { extractVideoBookmarks, formatBookmarkTime, isEstimatedBookmarkSet, sanitizeVideoBookmarks } from '../utils/chapters';
import { parseYouTubeUrl } from '../utils/youtube';
import {
  extractChapterBookmarksFromWatchHtml,
  extractMacroMarkerBookmarksFromWatchJson,
  parseCaptionJson3,
  parseCaptionXml,
  trimTranscriptForPrompt,
} from '../utils/youtubeTranscript';
import {
  activeProject,
  applyAddCheckpoint,
  applyAddPattern,
  applyAddProgressPhoto,
  applyAddProjectYarnColor,
  applyCreateCollectionFolder,
  applyCollectPatternToDefaultFolder,
  applySetPatternInFolders,
  applyToggleCollectPattern,
  applyCreateProject,
  applyHydrateCloudSlice,
  applySetAccount,
  applyAddPatternComment,
  applyRemovePatternComment,
  applyToggleFollowCreator,
  applyToggleLikePattern,
  applyTogglePatternInFolder,
  applyUpdateAccountProfile,
  applyDecrementRow,
  applyDecrementStitch,
  applyFinishProject,
  applyIncrementRow,
  applyIncrementStitch,
  applyPauseTimer,
  applyReconcileTimers,
  applyRemovePattern,
  applyRemoveCheckpoint,
  applyRemoveProjectYarnColor,
  applyRemoveStashItem,
  applyResetTimer,
  applySetActiveProject,
  applySetPatternBookmarks,
  applySetHookAndYarn,
  applySetRowNote,
  applySetStitchesPerRow,
  applySetTotalRows,
  applyStartTimer,
  applyToggleTimer,
  applyUndoLastTap,
  applyUpdateStashItem,
  elapsedSeconds,
  formatCheckpointTime,
  formatElapsed,
  projectProgress,
  mergeCatalogPatternsFromSeed,
  overlayRemoteCatalogOnBundled,
  reconcilePatternCatalog,
  repairPersisted,
  type CrochetData,
  type CrochetProject,
} from '../store/machine';
import { createSeedData, SEED_PATTERNS } from '../store/seed';
import {
  formatCommentCount,
  formatMakeCount,
  formatViewCount,
  getPatternExtendedMeta,
  getRelatedPatterns,
} from '../utils/patternDisplay';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function equal<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}\n  actual:   ${String(actual)}\n  expected: ${String(expected)}`);
  }
}

const FAWN = 'o_ge08T0-lA';

function expectVideo(input: string, kind: string) {
  const parsed = parseYouTubeUrl(input);
  assert(parsed, `expected a video for ${input}`);
  equal(parsed.videoId, FAWN, `video id for ${input}`);
  equal(parsed.kind, kind, `kind for ${input}`);
  equal(parsed.canonicalUrl, `https://www.youtube.com/watch?v=${FAWN}`, `canonical for ${input}`);
  equal(parsed.thumbnailUrl, `https://i.ytimg.com/vi/${FAWN}/maxresdefault.jpg`, `thumb for ${input}`);
  equal(parsed.thumbnails.hq, `https://i.ytimg.com/vi/${FAWN}/hqdefault.jpg`, `hq thumb for ${input}`);
}

expectVideo('https://www.youtube.com/watch?v=o_ge08T0-lA', 'watch');
expectVideo('https://www.youtube.com/watch?v=o_ge08T0-lA&list=PLabc&index=2&t=43s', 'watch');
expectVideo('https://m.youtube.com/watch?app=desktop&v=o_ge08T0-lA', 'watch');
expectVideo('https://music.youtube.com/watch?v=o_ge08T0-lA', 'watch');
expectVideo('https://www.youtube-nocookie.com/embed/o_ge08T0-lA?start=10', 'embed');
expectVideo('https://www.youtube.com/shorts/o_ge08T0-lA?feature=share', 'short');
expectVideo('https://www.youtube.com/live/o_ge08T0-lA/', 'live');
expectVideo('https://www.youtube.com/v/o_ge08T0-lA', 'watch');
expectVideo('youtu.be/o_ge08T0-lA', 'share');
expectVideo('youtu.be/o_ge08T0-lA', 'share');
expectVideo('https://youtu.be/o_ge08T0-lA&t=43', 'share');
expectVideo(`  \u200Bhttps://youtu.be/${FAWN}.  `, 'share');
expectVideo(FAWN, 'id');
expectVideo(
  'https://www.youtube.com/attribution_link?a=abc&u=%2Fwatch%3Fv%3Do_ge08T0-lA%26feature%3Dshare',
  'watch',
);
expectVideo('https://www.youtube.com/playlist?list=PLxxxxxxxx123&v=o_ge08T0-lA', 'watch');

assert(parseYouTubeUrl('https://www.youtube.com/playlist?list=PLxxxxxxxx123') == null, 'playlist without v');
assert(parseYouTubeUrl('https://example.com/watch?v=o_ge08T0-lA') == null, 'foreign host');
assert(parseYouTubeUrl('https://youtu.be/short') == null, 'short id');
assert(parseYouTubeUrl('https://www.youtube.com/watch?v=') == null, 'empty v');
assert(parseYouTubeUrl('javascript:alert(1)') == null, 'bad protocol');
assert(parseYouTubeUrl('') == null, 'empty');
assert(parseYouTubeUrl('not a url') == null, 'garbage');

const chapterText = [
  '0:00 Materials & Hook',
  '02:15 Row 1: Foundation',
  'Finishing & Border — 1:02:15',
].join('\n');
const extracted = extractVideoBookmarks(chapterText);
equal(extracted.length, 3, 'three extracted chapters');
equal(extracted[0]?.seconds, 0, 'first chapter at 0');
equal(extracted[0]?.label, 'Materials & Hook', 'materials label');
equal(extracted[1]?.seconds, 135, 'row chapter seconds');
equal(extracted[1]?.rowHint, 1, 'row hint from label');
equal(extracted[1]?.label, 'Row 1: Foundation', 'row label');
equal(extracted[2]?.seconds, 3735, 'hour timestamp');
equal(formatBookmarkTime(75), '01:15', 'bookmark time format');
equal(formatBookmarkTime(3735), '1:02:15', 'hour bookmark format');

const inlineChapters = extractVideoBookmarks('0:00 Intro, 12:30 Row 1, 24:00 Finishing');
equal(inlineChapters.length, 3, 'inline comma-separated chapters');
equal(inlineChapters[1]?.label, 'Row 1', 'inline row label');

const macroSample = {
  contents: [
    {
      macroMarkersListItemRenderer: {
        title: { simpleText: 'Foundation' },
        timeDescription: { simpleText: '2:15' },
        onTap: { innertubeCommand: { seekToCommand: { startTimeSeconds: 135 } } },
      },
    },
  ],
};
const macroBookmarks = extractMacroMarkerBookmarksFromWatchJson(macroSample);
equal(macroBookmarks.length, 1, 'macro marker chapter');
equal(macroBookmarks[0]?.seconds, 135, 'macro marker seconds');
equal(macroBookmarks[0]?.label, 'Foundation', 'macro marker label');

const watchHtml = `<html><script>ytInitialData = ${JSON.stringify(macroSample)};</script></html>`;
const fromWatch = extractChapterBookmarksFromWatchHtml(watchHtml);
equal(fromWatch.length, 1, 'chapters from watch html');

const seed = createSeedData();
equal(seed.patterns.length, SEED_PATTERNS.length, 'seed catalog pattern count');
equal(seed.projects.length, 1, 'one project');
equal(seed.projects[0]?.name, 'Bambi Amigurumi Plush', 'project name');
equal(seed.projects[0]?.currentRow, 28, 'bambi row');
equal(seed.projects[0]?.totalRows, 40, 'bambi total');
equal(seed.projects[0]?.currentStitch, 14, 'bambi stitch');
equal(seed.projects[0]?.stitchesPerRow, 60, 'bambi stitches per row');
equal(seed.projects[0]?.hookSize, '4.0 mm', 'bambi hook');
equal(seed.projects[0]?.yarnWeight, 'worsted', 'bambi yarn');
assert(
  seed.patterns.some((pattern) => pattern.id === seed.projects[0]?.patternId),
  'active project links a real pattern',
);
equal(seed.projects[0]?.timerStartedAt, null, 'bambi timer paused');
equal(formatElapsed(seed.projects[0]?.accumulatedSeconds ?? 0), '04:18:00', 'banked time');
equal(seed.projects[0]?.yarnColors.length, 4, 'four palette colors');
equal(seed.projects[0]?.yarnColors[0]?.label, 'Soft Fudge', 'first palette label');
equal(seed.projects[0]?.checkpoints[0]?.label, 'Beginning', 'first bookmark');
equal(seed.projects[0]?.checkpoints.length, 3, 'three bookmarks');
equal(formatCheckpointTime(75), '01:15', 'checkpoint time format');
equal(seed.yarnStash.length, 6, 'stash size');
assert(seed.patterns.every((pattern) => pattern.videoId.length === 11), 'parsed ids');
const persistedSlice = seed.patterns.slice(0, 8);
const mergedCatalog = mergeCatalogPatternsFromSeed(persistedSlice, seed.patterns);
equal(mergedCatalog.length, seed.patterns.length, 'seed catalog merges into persisted patterns');
equal(
  mergedCatalog.filter((pattern) => persistedSlice.some((item) => item.id === pattern.id)).length,
  8,
  'merged catalog keeps existing saved patterns',
);
const staleVideoId = 'removed-stale-video';
const stalePattern = {
  ...seed.patterns[0]!,
  id: 'pattern-stale-remote',
  videoId: staleVideoId,
  title: 'Knitting pattern for sweater',
};
const reconciled = reconcilePatternCatalog(
  [stalePattern, ...persistedSlice],
  seed.patterns,
  [],
  new Set(),
);
assert(!reconciled.some((pattern) => pattern.videoId === staleVideoId), 'reconcile drops stale feed entries');
equal(reconciled.length, seed.patterns.length, 'reconcile matches bundled catalog');
const remoteOnlyVideoId = 'remoteOnlyVid01';
const remoteOnlyPattern = {
  ...seed.patterns[0]!,
  id: 'pattern-remote-only-spam',
  videoId: remoteOnlyVideoId,
  title: 'WOW, You Have to SEE! Trendy crochet pattern!',
};
const remoteOverlay = overlayRemoteCatalogOnBundled(seed.patterns, [
  { ...seed.patterns[0]!, title: 'Updated title from CDN' },
  remoteOnlyPattern,
]);
equal(
  remoteOverlay.find((pattern) => pattern.id === seed.patterns[0]?.id)?.title,
  'Updated title from CDN',
  'remote overlay updates bundled video metadata',
);
assert(
  !remoteOverlay.some((pattern) => pattern.videoId === remoteOnlyVideoId),
  'remote overlay ignores patterns not in bundled catalog',
);
const bundledSubset = seed.patterns.slice(0, Math.max(1, seed.patterns.length - 3));
const remoteFullCatalog = seed.patterns;
const reconciledFromRemote = reconcilePatternCatalog(bundledSubset, bundledSubset, remoteFullCatalog, new Set());
equal(
  reconciledFromRemote.length,
  seed.patterns.length,
  'remote catalog expands feed beyond APK bundle',
);
const reconciledRemoteKnitting = reconcilePatternCatalog(
  [],
  seed.patterns,
  [{ ...remoteOnlyPattern, title: 'Knitting pattern for sweater' }],
  new Set(),
);
assert(
  !reconciledRemoteKnitting.some((pattern) => pattern.videoId === remoteOnlyVideoId),
  'reconcile filters invalid remote catalog entries',
);
equal(sanitizeVideoBookmarks(undefined).length, 0, 'no placeholder bookmarks');
assert(!isEstimatedBookmarkSet(extracted), 'real chapters are not estimates');
const withRealChapters = applySetPatternBookmarks(dataFrom(createSeedData()), seed.patterns[0]!.id, extracted);
assert(withRealChapters, 'youtube chapters can be saved');
equal(
  withRealChapters?.patterns.find((pattern) => pattern.id === seed.patterns[0]?.id)?.bookmarks[1]?.label,
  'Row 1: Foundation',
  'saved chapter label',
);
const clearedBookmarks = applySetPatternBookmarks(withRealChapters!, seed.patterns[0]!.id, []);
assert(
  clearedBookmarks &&
    clearedBookmarks.patterns.find((pattern) => pattern.id === seed.patterns[0]?.id)?.bookmarks.length === 0,
  'clear bookmarks',
);
assert(
  applySetPatternBookmarks(
    clearedBookmarks!,
    seed.patterns[0]!.id,
    clearedBookmarks!.patterns.find((pattern) => pattern.id === seed.patterns[0]?.id)?.bookmarks ?? [],
  ) == null,
  'same chapters are a no-op',
);
assert(seed.patterns.every((pattern) => pattern.thumbnailUrl.includes('maxresdefault')), 'thumbs');
const progress = projectProgress(seed.projects[0]!);
assert(progress > 0.68 && progress < 0.69, `progress ${progress}`);

function dataFrom(slice: ReturnType<typeof createSeedData>, history: CrochetData['tapHistory'] = {}): CrochetData {
  return { ...slice, tapHistory: history };
}

let data = dataFrom(seed);
const t0 = 1_700_000_000_000;
const started = applyStartTimer(data, t0);
assert(started, 'start');
equal(activeProject(started)?.timerStartedAt, t0, 'anchor');
assert(applyStartTimer(started, t0 + 5_000) == null, 'second start is a no-op');
const banked = seed.projects[0]!.accumulatedSeconds;
equal(elapsedSeconds(activeProject(started)!, t0 + 2 * 60 * 60 * 1000), banked + 7200, 'two quiet hours');
equal(elapsedSeconds(activeProject(started)!, t0 - 10_000), banked, 'clock backwards does not subtract');

const rebased = applyReconcileTimers(started, t0 - 10_000);
assert(rebased, 'rebase');
equal(activeProject(rebased)?.timerStartedAt, t0 - 10_000, 'anchor slid to now');
equal(elapsedSeconds(activeProject(rebased)!, t0 - 10_000), banked, 'rebase kept the bank');

const paused = applyPauseTimer(started, t0 + 1500);
assert(paused, 'pause');
equal(activeProject(paused)?.timerStartedAt, null, 'paused');
equal(activeProject(paused)?.accumulatedSeconds, banked + 1.5, 'fractional bank');
assert(applyPauseTimer(paused, t0 + 2000) == null, 'pause while paused');
const resumed = applyStartTimer(paused, t0 + 9_000);
assert(resumed, 'resume');
const repaused = applyPauseTimer(resumed, t0 + 9_000);
assert(repaused, 'immediate pause');
equal(activeProject(repaused)?.accumulatedSeconds, banked + 1.5, 'no double count');

const reset = applyResetTimer(repaused, t0);
assert(reset, 'reset');
equal(activeProject(reset)?.accumulatedSeconds, 0, 'cleared');
equal(activeProject(reset)?.timerStartedAt, null, 'reset stops');
assert(applyResetTimer(reset, t0) == null, 'reset twice');

const finished = applyFinishProject(applyStartTimer(reset, t0)!, t0 + 1000);
assert(finished, 'finish');
equal(activeProject(finished)?.status, 'finished', 'finished status');
equal(activeProject(finished)?.timerStartedAt, null, 'finish banks the timer');
assert(applyStartTimer(finished, t0 + 2000) == null, 'finished project does not start');
assert(applyToggleTimer(finished, t0 + 2000) == null, 'toggle on finished paused project');

function projectFixture(overrides: Partial<CrochetProject> = {}): CrochetData {
  const project: CrochetProject = {
    id: 'p',
    name: 'Swatch',
    patternId: null,
    status: 'in-progress',
    currentStitch: 0,
    stitchesPerRow: 3,
    currentRow: 1,
    totalRows: 2,
    hookSize: '4.0 mm',
    yarnWeight: 'worsted',
    timerStartedAt: null,
    accumulatedSeconds: 0,
    yarnColors: [],
    rowNote: '',
    checkpoints: [],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
  return {
    patterns: [],
    projects: [project],
    activeProjectId: 'p',
    yarnStash: [],
    progressPhotos: [],
    account: null,
    likedPatternIds: [],
    collectedPatternIds: [],
    collectionFolders: [],
    patternComments: [],
    followedCreators: [],
    tapHistory: {},
  };
}

function tap(times: number, source = projectFixture(), autoAdvance?: boolean) {
  let current = source;
  for (let index = 0; index < times; index += 1) {
    const next = applyIncrementStitch(current, index + 1, autoAdvance);
    assert(next, `tap ${index + 1} should count`);
    current = next;
  }
  return current;
}

let counter = tap(3);
equal(activeProject(counter)?.currentRow, 2, 'third tap rolls the row');
equal(activeProject(counter)?.currentStitch, 0, 'rolled to stitch 0');
counter = tap(3, counter);
equal(activeProject(counter)?.currentRow, 2, 'last row stays put');
equal(activeProject(counter)?.currentStitch, 3, 'last row shows full');
assert(applyIncrementStitch(counter, 99) == null, 'past the end is a no-op');
equal(projectProgress(activeProject(counter)!), 1, 'complete progress');

for (let index = 0; index < 6; index += 1) {
  const next = applyDecrementStitch(counter, 100 + index);
  assert(next, `decrement ${index + 1}`);
  counter = next;
}
equal(activeProject(counter)?.currentRow, 1, 'six decrements restore the row');
equal(activeProject(counter)?.currentStitch, 0, 'six decrements restore the stitch');
assert(applyDecrementStitch(counter, 200) == null, 'origin decrement');
assert(applyDecrementRow(counter, 200) == null, 'origin row');

const held = tap(2, projectFixture(), false);
equal(activeProject(held)?.currentStitch, 2, 'manual count');
const heldFull = applyIncrementStitch(held, 3, false);
assert(heldFull, 'fills without rolling');
equal(activeProject(heldFull)?.currentRow, 1, 'auto-advance off stays on the row');
equal(activeProject(heldFull)?.currentStitch, 3, 'stops on the full row');
assert(applyIncrementStitch(heldFull, 4, false) == null, 'does not pass the row');

let undoable = projectFixture();
undoable = applyIncrementStitch(undoable, 1)!;
undoable = applyIncrementStitch(undoable, 2)!;
equal(undoable.tapHistory.p?.length, 2, 'two taps remembered');
undoable = applyUndoLastTap(undoable, 3)!;
undoable = applyUndoLastTap(undoable, 4)!;
equal(activeProject(undoable)?.currentStitch, 0, 'double tap undone');
assert(applyUndoLastTap(undoable, 5) == null, 'empty undo');

let capped = projectFixture({ stitchesPerRow: 100, totalRows: 1 });
for (let index = 0; index < 31; index += 1) capped = applyIncrementStitch(capped, index + 1)!;
equal(capped.tapHistory.p?.length, 30, 'history cap');
for (let index = 0; index < 30; index += 1) capped = applyUndoLastTap(capped, 100 + index)!;
equal(activeProject(capped)?.currentStitch, 1, 'oldest tap falls off the stack');
assert(applyUndoLastTap(capped, 200) == null, 'cap leaves nothing else to undo');

let rows = projectFixture({ currentStitch: 2, currentRow: 1, totalRows: 3, stitchesPerRow: 3 });
rows = applyIncrementRow(rows, 1)!;
equal(activeProject(rows)?.currentRow, 2, 'manual next row');
equal(activeProject(rows)?.currentStitch, 0, 'manual next row resets the stitch');
rows = applyUndoLastTap(rows, 2)!;
equal(activeProject(rows)?.currentRow, 1, 'undo restores the row');
equal(activeProject(rows)?.currentStitch, 2, 'undo restores the stitch');
rows = applyIncrementRow(applyIncrementRow(rows, 3)!, 4)!;
assert(applyIncrementRow(rows, 5) == null, 'cannot row past the goal');
const goal = projectFixture({ currentRow: 2, currentStitch: 0, totalRows: 5, stitchesPerRow: 3 });
const shrunk = applySetTotalRows(goal, 1, 6);
equal(activeProject(shrunk!)?.totalRows, 2, 'goal cannot hide the current row');
equal(activeProject(shrunk!)?.currentRow, 2, 'shrinking the goal keeps the row you are on');
assert(applySetStitchesPerRow(rows, Number.NaN, 7) == null, 'reject NaN');
const narrowed = applySetStitchesPerRow(projectFixture({ currentStitch: 3, stitchesPerRow: 5 }), 2, 8);
equal(activeProject(narrowed!)?.currentStitch, 2, 'stitch clamps to the new row length');
equal(narrowed?.tapHistory.p?.length, 0, 'geometry change clears undo');

const created = applyCreateProject(applyStartTimer(dataFrom(seed), t0)!, { name: '   ' }, 'project-blank', t0);
assert(created == null, 'blank name');
const nextMake = applyCreateProject(applyStartTimer(dataFrom(seed), t0)!, { name: 'Moss Swatch', patternId: 'missing' }, 'project-swatch', t0 + 4000);
assert(nextMake, 'create');
equal(nextMake.activeProjectId, 'project-swatch', 'new project is active');
const bambi = nextMake.projects.find((project) => project.id === 'project-bambi');
equal(bambi?.timerStartedAt, null, 'leaving a project banks its timer');
equal(bambi?.accumulatedSeconds, banked + 4, 'banked the open four seconds');
assert(applySetActiveProject(nextMake, 'nope', t0) == null, 'unknown project');

let yarn = dataFrom(seed);
const recolored = applyUpdateStashItem(yarn, 'yarn-soft-fudge', { hexColor: '#abc' }, 8);
assert(recolored, 'stash hex update');
equal(recolored.yarnStash.find((item) => item.id === 'yarn-soft-fudge')?.hexColor, '#AABBCC', 'hex normalized');
assert(applyUpdateStashItem(recolored, 'missing', { brand: 'Nope' }, 6) == null, 'missing skein');

const noted = applySetRowNote(recolored, '  sc x 12  ', 9)!;
equal(activeProject(noted)?.rowNote, 'sc x 12', 'row note trimmed');
assert(applyAddProjectYarnColor(noted, 'color-test', { hexColor: '#ff00aa', label: 'Pop' }, 10) == null, 'palette capped at four');
const withRoom = applyRemoveProjectYarnColor(noted, 'color-blush', 11)!;
const withColor = applyAddProjectYarnColor(withRoom, 'color-new', { hexColor: '#112233', label: 'Navy' }, 12)!;
assert(withColor, 'add palette color');
equal(activeProject(withColor)?.yarnColors.some((item) => item.label === 'Navy'), true, 'navy saved');
const checkpointed = applyAddCheckpoint(withColor, 'cp-test', { label: 'Body', timestampSeconds: 90 }, 13)!;
equal(
  activeProject(checkpointed)?.checkpoints.some((item) => item.id === 'cp-test' && item.label === 'Body'),
  true,
  'checkpoint stored',
);
const cleared = applyRemoveCheckpoint(checkpointed, 'cp-beginning', 14)!;
assert(!cleared.projects[0]?.checkpoints.some((item) => item.id === 'cp-beginning'), 'bookmark removed');

const removed = applyRemoveStashItem(cleared, 'yarn-soft-fudge', 15)!;
assert(!removed.yarnStash.some((item) => item.id === 'yarn-soft-fudge'), 'skein deleted');
equal(activeProject(removed)?.yarnColors.some((item) => item.label === 'Soft Fudge'), true, 'palette independent of stash');

const repaired = repairPersisted(
  {
    patterns: seed.patterns,
    yarnStash: seed.yarnStash,
    activeProjectId: 'missing-project',
    projects: [
      {
        ...seed.projects[0],
        currentRow: 50,
        totalRows: 10,
        currentStitch: 99999,
        accumulatedSeconds: -12,
        timerStartedAt: 9_000_000_000_000_000,
        yarnColors: [],
        slots: [{ id: 'A1', colorName: 'Blue', hexColor: '#00f' }],
      },
      { id: 'project-bambi', name: 'duplicate dropped' },
    ],
  },
  t0,
);
assert(repaired, 'repair');
equal(repaired.projects.length, 1, 'duplicate id dropped');
equal(repaired.activeProjectId, 'project-bambi', 'stale active id falls back');
equal(repaired.projects[0]?.currentRow, 50, 'row kept');
equal(repaired.projects[0]?.totalRows, 50, 'goal lifted to the current row');
equal(repaired.projects[0]?.currentStitch, 60, 'stitch clamped');
equal(repaired.projects[0]?.accumulatedSeconds, 0, 'negative time dropped');
equal(repaired.projects[0]?.timerStartedAt, t0, 'future anchor rebased');
equal(repaired.projects[0]?.yarnColors[0]?.label, 'Blue', 'legacy slot migrated to palette');
assert(repairPersisted({ nope: true }) == null, 'foreign blob is rejected');
assert(repairPersisted(null) == null, 'null blob is rejected');

const legacy = repairPersisted(
  {
    patterns: seed.patterns,
    yarnStash: seed.yarnStash,
    activeProjectId: 'project-bambi',
    projects: [
      {
        id: 'project-bambi',
        name: 'Bambi Amigurumi Plush',
        patternId: 'pattern-little-fawn',
        status: 'in-progress',
        currentStitch: 17,
        stitchesPerRow: 36,
        currentRow: 28,
        totalRows: 40,
        timerStartedAt: null,
        accumulatedSeconds: 0,
        slots: [{ id: 'A1', stashItemId: 'yarn-soft-fudge', colorName: 'Soft Fudge', hexColor: '#C6A36E' }],
      },
    ],
  },
  t0,
);
equal(legacy?.projects[0]?.patternId, seed.projects[0]?.patternId, 'legacy sample links a real tutorial');
equal(legacy?.projects[0]?.currentStitch, 14, 'legacy sample stitch');
equal(legacy?.projects[0]?.stitchesPerRow, 60, 'legacy sample row length');
equal(legacy?.projects[0]?.hookSize, '4.0 mm', 'legacy sample hook');
equal(legacy?.projects[0]?.yarnWeight, 'worsted', 'legacy sample yarn');
equal(legacy?.projects[0]?.yarnColors[0]?.label, 'Soft Fudge', 'legacy slots lifted to palette');

const tooled = applySetHookAndYarn(dataFrom(seed), { hookSize: '5.0 mm', yarnWeight: 'bulky' }, t0);
assert(tooled, 'tooling');
equal(activeProject(tooled)?.hookSize, '5.0 mm', 'hook updated');
equal(activeProject(tooled)?.yarnWeight, 'bulky', 'yarn updated');
assert(applySetHookAndYarn(tooled, { hookSize: '5.0 mm' }, t0) == null, 'same hook is a no-op');

const duplicate = applyAddPattern(dataFrom(seed), 'pattern-copy', {
  title: 'Another fawn',
  youtubeUrl: 'https://youtu.be/YED4ZOWimsE',
});
assert(duplicate == null, 'duplicate video is rejected');

const skeinUp = applyUpdateStashItem(dataFrom(seed), 'yarn-soft-fudge', { skeinCount: 4 }, t0);
equal(skeinUp?.yarnStash.find((item) => item.id === 'yarn-soft-fudge')?.skeinCount, 4, 'skein count updates');
assert(applyUpdateStashItem(skeinUp!, 'yarn-soft-fudge', { skeinCount: 4 }, t0) == null, 'same skein count is a no-op');

const shot = applyAddProgressPhoto(
  dataFrom(seed),
  'photo-1',
  {
    projectId: 'project-bambi',
    uri: 'data:image/jpeg;base64,aaaa',
    projectName: 'Bambi Amigurumi Plush',
    row: 28,
    totalRows: 40,
    percent: 70,
    elapsedSeconds: 4 * 3600 + 18 * 60,
    hookSize: '4.0 mm',
    createdAt: t0,
  },
  t0,
);
equal(shot?.progressPhotos.length, 1, 'progress photo stored');
equal(shot?.progressPhotos[0]?.percent, 70, 'sticker percent frozen');
assert(shot?.progressPhotos[0]?.caption === undefined, 'photo without caption omits field');
assert(applyAddProgressPhoto(dataFrom(seed), 'photo-x', { ...shot!.progressPhotos[0]!, projectId: 'missing', uri: 'data:image/jpeg;base64,aaaa' }, t0) == null, 'photo needs a project');

const note =
  'Finished the ears! Switching to Champagne White and a very long note that should trim cleanly at the one-twenty character ceiling without breaking repair.';
const captioned = applyAddProgressPhoto(
  shot!,
  'photo-2',
  {
    projectId: 'project-bambi',
    uri: 'data:image/jpeg;base64,bbbb',
    projectName: 'Bambi Amigurumi Plush',
    row: 29,
    totalRows: 40,
    percent: 72,
    elapsedSeconds: 100,
    hookSize: '4.0 mm',
    caption: note,
    createdAt: t0 + 1,
  },
  t0 + 1,
);
assert(captioned, 'caption photo stored');
equal(captioned?.progressPhotos.length, 2, 'two progress photos');
const savedCaption = captioned?.progressPhotos.find((photo) => photo.id === 'photo-2')?.caption;
assert(savedCaption && savedCaption.length === 120, 'caption sanitized to 120 chars');
assert(savedCaption.startsWith('Finished the ears!'), 'caption text kept');
const repairedPhotos = repairPersisted(
  {
    patterns: seed.patterns,
    yarnStash: seed.yarnStash,
    activeProjectId: 'project-bambi',
    projects: seed.projects,
    progressPhotos: [
      captioned!.progressPhotos.find((photo) => photo.id === 'photo-2')!,
      {
        id: 'photo-legacy',
        projectId: 'project-bambi',
        uri: 'data:image/jpeg;base64,cccc',
        projectName: 'Bambi Amigurumi Plush',
        row: 1,
        totalRows: 40,
        percent: 3,
        elapsedSeconds: 60,
        hookSize: '4.0 mm',
        createdAt: t0,
      },
    ],
  },
  t0,
);
assert(repairedPhotos, 'photos repair');
equal(repairedPhotos?.progressPhotos.find((photo) => photo.id === 'photo-2')?.caption, savedCaption, 'caption survives repair');
assert(repairedPhotos?.progressPhotos.find((photo) => photo.id === 'photo-legacy')?.caption === undefined, 'legacy photo without caption');

const legacyStash = repairPersisted(
  {
    yarnStash: [{ id: 'yarn-old', hexColor: '#abc', brand: 'Old', colorName: 'Blue', yarnWeight: 'lace' }],
    patterns: [],
    projects: [],
  },
  t0,
);
equal(legacyStash?.yarnStash[0]?.skeinCount, 1, 'missing skein count repairs to 1');
equal(legacyStash?.progressPhotos.length, 0, 'missing photo log repairs empty');
equal(legacyStash?.likedPatternIds.length, 0, 'legacy stash repairs empty likes');
equal(legacyStash?.collectionFolders.length, 1, 'legacy stash ensures default collection folder');
assert(legacyStash?.collectionFolders[0]?.isDefault, 'default collection flagged');
equal(legacyStash?.collectedPatternIds.length, 0, 'legacy stash repairs empty collection');
equal(legacyStash?.account, null, 'legacy stash repairs null account');

const account = {
  uid: 'user-1',
  email: 'nick@example.com',
  displayName: 'Nick',
  username: 'nick',
  bio: 'Making plushies',
  avatarColor: '#2F6B4F',
  updatedAt: t0,
};
const withAccount = applySetAccount(dataFrom(seed), account);
assert(withAccount?.account?.username === 'nick', 'set account');
const profilePatch = applyUpdateAccountProfile(withAccount!, { bio: 'Blankets next', displayName: 'Nick C' }, t0 + 1);
equal(profilePatch?.account?.bio, 'Blankets next', 'profile bio updated');
equal(profilePatch?.account?.displayName, 'Nick C', 'profile name updated');

const patternId = seed.patterns[0]!.id;
const liked = applyToggleLikePattern(dataFrom(seed), patternId);
assert(liked?.likedPatternIds.includes(patternId), 'like pattern');
const unliked = applyToggleLikePattern(liked!, patternId);
assert(unliked && !unliked.likedPatternIds.includes(patternId), 'unlike pattern');
assert(applyToggleLikePattern(dataFrom(seed), 'missing-pattern') == null, 'like unknown pattern is no-op');

const collected = applyToggleCollectPattern(dataFrom(seed), patternId);
assert(collected?.collectedPatternIds.includes(patternId), 'collect pattern');
const uncollected = applyToggleCollectPattern(collected!, patternId);
assert(uncollected && !uncollected.collectedPatternIds.includes(patternId), 'uncollect pattern');

const foldered = applyCreateCollectionFolder(dataFrom(seed), 'folder-1', { name: 'Weekend makes', description: 'Soft toys' }, t0);
assert(foldered?.collectionFolders.some((folder) => folder.name === 'Weekend makes'), 'create folder');
assert(foldered?.collectionFolders.some((folder) => folder.isDefault), 'ensure default collection exists');
const multi = applySetPatternInFolders(foldered!, patternId, ['folder-1', 'folder-default'], t0 + 1);
assert(
  multi?.collectionFolders.find((folder) => folder.id === 'folder-1')?.patternIds.includes(patternId),
  'set pattern in folders adds',
);
const defaultCollect = applyCollectPatternToDefaultFolder(dataFrom(seed), patternId, t0 + 2);
assert(defaultCollect?.data.collectedPatternIds.includes(patternId), 'collect to default folder');
const inFolder = applyTogglePatternInFolder(foldered!, 'folder-1', patternId, t0 + 4);
assert(
  inFolder?.collectionFolders.find((folder) => folder.id === 'folder-1')?.patternIds.includes(patternId),
  'toggle pattern into folder',
);
assert(inFolder?.collectedPatternIds.includes(patternId), 'folder add also collects');
const outFolder = applyTogglePatternInFolder(inFolder!, 'folder-1', patternId, t0 + 5);
assert(
  outFolder && outFolder.collectionFolders.find((folder) => folder.id === 'folder-1')?.patternIds.length === 0,
  'toggle pattern out of folder',
);

const cloudSlice = applyHydrateCloudSlice(
  dataFrom(seed),
  {
    ...seed,
    likedPatternIds: [patternId, 'missing-like'],
    collectionFolders: [
      {
        id: 'folder-cloud',
        name: 'Cloud folder',
        description: '',
        patternIds: [patternId],
        createdAt: t0,
        updatedAt: t0,
      },
    ],
    account,
  },
  seed.patterns,
  t0,
);
assert(cloudSlice?.likedPatternIds.includes(patternId), 'hydrate keeps valid likes');
equal(cloudSlice?.collectionFolders.length, 1, 'hydrate repairs folders');
assert(!cloudSlice?.likedPatternIds.includes('missing-like'), 'hydrate drops unknown likes');

const removedPattern = applyRemovePattern(
  applyToggleLikePattern(
    applyTogglePatternInFolder(foldered!, 'folder-1', patternId, t0 + 4)!,
    patternId,
  )!,
  patternId,
  t0 + 5,
);
assert(removedPattern && !removedPattern.likedPatternIds.includes(patternId), 'remove pattern clears likes');
assert(removedPattern && !removedPattern.collectedPatternIds.includes(patternId), 'remove pattern clears collection');
assert(
  removedPattern.collectionFolders.every((folder: { patternIds: string[] }) => !folder.patternIds.includes(patternId)),
  'remove pattern clears folders',
);

equal(seed.patternComments.length > 0, true, 'seed includes pattern comments');
equal(formatViewCount(patternId), formatViewCount(patternId), 'view count is stable');
equal(formatMakeCount(patternId), formatMakeCount(patternId), 'make count is stable');
const meta = getPatternExtendedMeta(seed.patterns[0]!);
assert(meta.description.length > 0, 'extended meta description');
assert(meta.summary.length > 0, 'extended meta summary');
assert(meta.communityReviews.some((comment) => comment.pinned), 'pinned designer review');
const related = getRelatedPatterns(seed.patterns[0]!, seed.patterns, 4);
assert(related.every((item) => item.id !== patternId), 'related excludes self');

const commented = applyAddPatternComment(
  dataFrom(seed),
  'comment-user-1',
  {
    patternId,
    authorName: 'Nick',
    authorUsername: 'nick',
    rating: 5,
    body: 'Love this stitch!',
  },
  t0,
);
assert(commented?.patternComments.some((comment) => comment.id === 'comment-user-1'), 'add pattern comment');
const uncommented = applyRemovePatternComment(commented!, 'comment-user-1');
assert(uncommented && !uncommented.patternComments.some((comment) => comment.id === 'comment-user-1'), 'remove comment');
assert(applyAddPatternComment(dataFrom(seed), 'comment-user-1', { patternId: 'missing', authorName: 'X', rating: 3, body: 'nope' }, t0) == null, 'comment on missing pattern');

const creator = seed.patterns[0]!.creator;
const followed = applyToggleFollowCreator(dataFrom(seed), creator);
assert(followed?.followedCreators.includes(creator), 'follow creator');
const unfollowed = applyToggleFollowCreator(followed!, creator);
assert(unfollowed && !unfollowed.followedCreators.includes(creator), 'unfollow creator');

const removedWithComments = applyRemovePattern(
  applyAddPatternComment(dataFrom(seed), 'comment-temp', { patternId, authorName: 'A', rating: 4, body: 'temp' }, t0)!,
  patternId,
  t0 + 6,
);
assert(removedWithComments && removedWithComments.patternComments.every((comment) => comment.patternId !== patternId), 'remove pattern clears comments');

equal(formatCommentCount(patternId, 1), formatCommentCount(patternId, 1), 'comment count stable');

assert(
  parseCaptionXml('<text start="0">Chain &amp; single crochet</text>') === 'Chain & single crochet',
  'caption xml decode',
);
assert(parseCaptionJson3('{"events":[{"segs":[{"utf8":"Row one"}]}]}') === 'Row one', 'caption json3 parse');
assert(trimTranscriptForPrompt('a'.repeat(50), 20).endsWith('…'), 'transcript trim');

console.log('crochet machine checks passed');
