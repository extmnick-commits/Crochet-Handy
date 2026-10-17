/**
 * Edge-case checks for the crochet state machine and YouTube parser.
 * Run with: npx tsx scripts/check-crochet-machine.ts
 */
import { extractVideoBookmarks, formatBookmarkTime, isEstimatedBookmarkSet, sanitizeVideoBookmarks } from '../utils/chapters';
import { preFilterSubmission, reviewCrochetPattern } from '../utils/crochetReview';
import {
  canRecordCommunitySubmission,
  COMMUNITY_SUBMISSION_WINDOW_MS,
  pruneCommunitySubmissionTimes,
} from '../utils/communitySubmission';
import {
  communityPublishStatus,
  detectPatternVideo,
  embeddedTutorialUrl,
  extractPatternSteps,
  parsePatternAiReview,
} from '../utils/patternAiParser';
import { acceptsCrochetExtraction, mapExtractedPattern } from '../utils/patternExtraction';
import {
  isEnglishFeedPattern,
  isValidEnglishYoutubeSnippet,
  uploadYoutubeSnippetRejection,
} from '../utils/patternEnglishFilter';
import { parseYouTubeUrl } from '../utils/youtube';
import { parseCommunityDocument } from './communityCatalogFirestore';
import { assemblePatternCatalog } from './export-pattern-catalog';
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
  fitCrochetPersistedSliceForFirestore,
  fitProgressPhotosForFirestore,
  mergeProgressPhotosById,
  mergeProjectsByUpdatedAt,
  applySetAccount,
  applyAddPatternComment,
  applyRemovePatternComment,
  applyToggleFollowCreator,
  applyToggleLikePattern,
  applyTogglePatternInFolder,
  applyUpdateAccountProfile,
  applyRecordUpload,
  applyUploadQuota,
  canUploadToday,
  decideUploadAccess,
  DEFAULT_UPLOAD_QUOTA,
  readUploadQuota,
  resolveUploadQuota,
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
  progressPhotoCreatedAtIso,
  projectProgress,
  mergeCatalogPatternsFromSeed,
  mergeCommunityPatterns,
  overlayRemoteCatalogOnBundled,
  patternFromCommunitySubmission,
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
equal(shot?.progressPhotos[0]?.rowNumber, 28, 'row snapshot mirrors the counter');
equal(shot?.progressPhotos[0]?.sessionDurationSeconds, 4 * 3600 + 18 * 60, 'timer snapshot mirrors elapsed');
assert(shot?.progressPhotos[0]?.caption === undefined, 'photo without caption omits field');
assert(shot?.progressPhotos[0]?.note === undefined, 'photo without note omits field');
assert(shot?.progressPhotos[0]?.stitchCount === undefined, 'stitch snapshot omitted until provided');
assert(shot?.progressPhotos[0]?.milestoneTag === undefined, 'milestone omitted until chosen');
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
equal(repairedPhotos?.progressPhotos.find((photo) => photo.id === 'photo-2')?.note, savedCaption, 'note mirrored from caption survives repair');
equal(repairedPhotos?.progressPhotos.find((photo) => photo.id === 'photo-2')?.rowNumber, 29, 'row snapshot survives repair');
const legacyPhoto = repairedPhotos?.progressPhotos.find((photo) => photo.id === 'photo-legacy');
assert(legacyPhoto?.caption === undefined, 'legacy photo without caption');
assert(legacyPhoto?.note === undefined, 'legacy photo without note');
assert(legacyPhoto?.rowNumber === undefined, 'legacy photo without row snapshot');
assert(legacyPhoto?.stitchCount === undefined, 'legacy photo without stitch snapshot');
assert(legacyPhoto?.sessionDurationSeconds === undefined, 'legacy photo without session duration');
assert(legacyPhoto?.milestoneTag === undefined, 'legacy photo without milestone');

const richStamp = '2026-10-15T17:06:00.000Z';
const rich = applyAddProgressPhoto(
  captioned!,
  'photo-rich',
  {
    projectId: 'project-bambi',
    uri: 'data:image/jpeg;base64,dddd',
    projectName: 'Bambi Amigurumi Plush',
    row: 30,
    rowNumber: 30,
    totalRows: 40,
    percent: 75,
    elapsedSeconds: 1200,
    sessionDurationSeconds: 900,
    stitchCount: 12,
    hookSize: '4.0 mm',
    caption: 'Ears catching the light',
    note: 'Switching yarn after the color change',
    milestoneTag: 'Color Change',
    createdAt: richStamp,
  },
  t0 + 2,
);
const richPhoto = rich?.progressPhotos.find((photo) => photo.id === 'photo-rich');
equal(richPhoto?.rowNumber, 30, 'rich row snapshot stored');
equal(richPhoto?.stitchCount, 12, 'stitch snapshot stored');
equal(richPhoto?.sessionDurationSeconds, 900, 'session duration stored');
equal(richPhoto?.milestoneTag, 'Color Change', 'milestone tag stored');
equal(richPhoto?.note, 'Switching yarn after the color change', 'note stored beside caption');
equal(richPhoto?.createdAt, Date.parse(richStamp), 'iso createdAt repairs to epoch');
equal(progressPhotoCreatedAtIso(richPhoto?.createdAt ?? 0), new Date(Date.parse(richStamp)).toISOString(), 'iso helper round-trips');

const droppedTag = applyAddProgressPhoto(
  captioned!,
  'photo-tag',
  {
    projectId: 'project-bambi',
    uri: 'data:image/jpeg;base64,eeee',
    projectName: 'Bambi Amigurumi Plush',
    row: 30,
    totalRows: 40,
    percent: 75,
    elapsedSeconds: 10,
    hookSize: '4.0 mm',
    milestoneTag: 'Not a real chip',
    createdAt: t0 + 3,
  },
  t0 + 3,
);
assert(droppedTag?.progressPhotos.find((photo) => photo.id === 'photo-tag')?.milestoneTag === undefined, 'unknown milestone dropped');

const repairedRich = repairPersisted(
  {
    patterns: seed.patterns,
    yarnStash: seed.yarnStash,
    activeProjectId: 'project-bambi',
    projects: seed.projects,
    progressPhotos: [richPhoto],
  },
  t0,
);
const healedRich = repairedRich?.progressPhotos.find((photo) => photo.id === 'photo-rich');
equal(healedRich?.stitchCount, 12, 'stitch snapshot survives repair');
equal(healedRich?.milestoneTag, 'Color Change', 'milestone survives repair');
equal(healedRich?.sessionDurationSeconds, 900, 'session duration survives repair');
equal(healedRich?.createdAt, Date.parse(richStamp), 'iso timestamp survives repair');

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
  ...DEFAULT_UPLOAD_QUOTA,
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

const localProject = seed.projects[0]!;
const advancedLocal = applyIncrementRow(dataFrom(seed), t0 + 50)!;
assert(advancedLocal, 'increment row for merge test');
const localRow = activeProject(advancedLocal)?.currentRow ?? 0;
const localPhoto = applyAddProgressPhoto(
  advancedLocal,
  'photo-local-only',
  {
    projectId: localProject.id,
    uri: 'data:image/jpeg;base64,local',
    projectName: localProject.name,
    row: localRow,
    totalRows: localProject.totalRows,
    percent: 10,
    elapsedSeconds: 30,
    hookSize: localProject.hookSize,
    createdAt: t0 + 60,
  },
  t0 + 60,
)!;
const cloudProject = {
  ...localProject,
  currentRow: 1,
  updatedAt: t0,
};
const cloudPhoto = {
  id: 'photo-cloud-only',
  projectId: localProject.id,
  uri: 'data:image/jpeg;base64,cloud',
  projectName: localProject.name,
  row: 1,
  totalRows: localProject.totalRows,
  percent: 3,
  elapsedSeconds: 10,
  hookSize: localProject.hookSize,
  createdAt: t0 + 10,
};
const mergedSlice = applyHydrateCloudSlice(
  localPhoto!,
  {
    patterns: seed.patterns,
    projects: [cloudProject],
    activeProjectId: localProject.id,
    yarnStash: [],
    progressPhotos: [cloudPhoto],
    account: null,
    likedPatternIds: [],
    collectedPatternIds: [],
    collectionFolders: [],
    patternComments: [],
    followedCreators: [],
  },
  seed.patterns,
  t0 + 100,
);
assert(mergedSlice, 'hydrate merges local and cloud');
equal(activeProject(mergedSlice)?.currentRow, localRow, 'hydrate keeps newer local row progress');
equal(mergedSlice.progressPhotos.length, 2, 'hydrate unions local and cloud progress photos');
assert(mergedSlice.progressPhotos.some((photo) => photo.id === 'photo-local-only'), 'local progress photo kept');
assert(mergedSlice.progressPhotos.some((photo) => photo.id === 'photo-cloud-only'), 'cloud progress photo kept');

const mergedProjects = mergeProjectsByUpdatedAt([{ ...localProject, currentRow: 5, updatedAt: 200 }], [
  { ...localProject, currentRow: 2, updatedAt: 100 },
]);
equal(mergedProjects[0]?.currentRow, 5, 'merge projects prefers newer updatedAt');

const mergedPhotos = mergeProgressPhotosById(
  [{ ...cloudPhoto, id: 'a', createdAt: 1 }],
  [{ ...cloudPhoto, id: 'b', createdAt: 2 }],
);
equal(mergedPhotos.length, 2, 'merge photos unions ids');

const trimmed = fitProgressPhotosForFirestore([
  { ...cloudPhoto, id: 'big', uri: 'data:image/jpeg;base64,' + 'a'.repeat(500_000) },
  { ...cloudPhoto, id: 'small', uri: 'data:image/jpeg;base64,aa' },
]);
assert(trimmed.some((photo) => photo.id === 'small'), 'firestore fit keeps small stills');
assert(!trimmed.some((photo) => photo.id === 'big'), 'firestore fit drops oversized stills');

const slice = fitCrochetPersistedSliceForFirestore({
  patterns: seed.patterns,
  projects: seed.projects,
  activeProjectId: seed.activeProjectId,
  yarnStash: seed.yarnStash,
  progressPhotos: trimmed,
  account: null,
  likedPatternIds: [],
  collectedPatternIds: [],
  collectionFolders: [],
  patternComments: [],
  followedCreators: [],
});
equal(slice.progressPhotos.length, trimmed.length, 'firestore slice keeps trimmed photos');

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

assert(seed.patterns.every((pattern) => pattern.source == null && pattern.videoUrl == null), 'seed patterns keep the original catalog shape');

const youtubeInPost = detectPatternVideo({
  url: 'https://example.com/free-pattern',
  text: 'Watch the clip https://youtu.be/YED4ZOWimsE and https://www.facebook.com/watch/?v=123',
});
equal(youtubeInPost?.videoId, 'YED4ZOWimsE', 'youtube link wins inside a post');
equal(youtubeInPost?.source, 'youtube', 'detected source is youtube');

const facebookClip = detectPatternVideo({ url: 'https://www.facebook.com/watch/?v=998877', text: '' });
equal(facebookClip?.source, 'facebook', 'facebook watch url');
equal(facebookClip?.videoId, '', 'facebook clip has no youtube id');
assert(detectPatternVideo({ url: 'javascript:alert(1)', text: '' }) == null, 'script url is ignored');

const stitchLines = extractPatternSteps('Email me at maker@example.com\nRow 1: ch 12\nRow 2: sc in each st across\nThanks!');
equal(stitchLines.length, 2, 'stitch lines extracted');
assert(!stitchLines.join(' ').includes('@'), 'extracted steps drop email addresses');

const facebookSaved = applyAddPattern(dataFrom(seed), 'pattern-fb-market', {
  title: 'Market bag',
  youtubeUrl: 'https://www.facebook.com/watch/?v=998877',
  videoUrl: 'https://www.facebook.com/watch/?v=998877',
  source: 'facebook',
  steps: ['Row 1: ch 30', 'Row 2: dc across'],
});
assert(facebookSaved, 'facebook import saves');
const facebookPattern = facebookSaved?.patterns.find((pattern) => pattern.id === 'pattern-fb-market');
equal(facebookPattern?.source, 'facebook', 'facebook source stored');
equal(facebookPattern?.videoId, '', 'facebook pattern does not invent a youtube id');
assert(
  applyAddPattern(facebookSaved!, 'pattern-fb-copy', {
    title: 'Market bag again',
    youtubeUrl: 'https://www.facebook.com/watch/?v=998877',
  }) == null,
  'duplicate facebook url rejected',
);
const secondClip = applyAddPattern(facebookSaved!, 'pattern-fb-other', {
  title: 'Other market clip',
  youtubeUrl: 'https://fb.watch/zzzzzzzz/',
});
assert(secondClip, 'a different facebook clip still saves');

const communityPattern = patternFromCommunitySubmission('community-market-bag', {
  title: 'Crochet market bag',
  steps: ['Row 1: ch 30', 'Row 2: sc across', 'maker@example.com'],
  hookSize: '5.0 mm',
  yarnWeight: 'worsted',
  source: 'facebook',
  videoUrl: 'https://www.facebook.com/watch/?v=445566',
  status: 'pending',
});
assert(communityPattern, 'valid community submission becomes a pattern');
assert(
  patternFromCommunitySubmission('community-zoo', {
    title: 'Me at the zoo',
    steps: ['Row 1: ch 12', 'Row 2: sc across'],
    hookSize: '5.0 mm',
    yarnWeight: 'worsted',
    source: 'youtube',
    videoUrl: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
    status: 'pending',
  }) == null,
  'unrelated video stays out of the community catalog',
);
assert(
  reviewCrochetPattern({ title: 'Knitting pattern for a sweater', steps: ['Row 1: k2 p2'] }).ok === false,
  'knitting submission is rejected',
);
assert(
  reviewCrochetPattern({ title: 'Market bag', steps: ['Row 1: ch 30', 'Row 2: dc across'] }).ok === true,
  'crochet project with stitch rows passes review',
);
const stitchText =
  'Rnd 1: mr, 6 sc into the ring. Rnd 2: inc in each stitch around. Fasten off and weave the ends for this amigurumi piece.';
assert(preFilterSubmission(stitchText).ok === true, 'stitch instructions pass the local gate');
assert(preFilterSubmission(`${stitchText} See craft.co for yarn.`).ok === true, 'a normal domain is not treated as a shortlink');
assert(preFilterSubmission('too short').ok === false, 'short text never reaches the model');
assert(preFilterSubmission(`${stitchText} ${'x'.repeat(10_000)}`).ok === false, 'overlong text never reaches the model');
assert(preFilterSubmission(`${stitchText} join t.me/freebies`).ok === false, 'telegram links are rejected locally');
assert(preFilterSubmission(`${stitchText} https://bit.ly/hooks`).ok === false, 'shortlinks are rejected locally');
assert(
  preFilterSubmission(
    'This is a long note about a soft hat I want to make someday with nice yarn for winter gifts and calm weekends at home.',
  ).ok === false,
  'prose without stitch markers is rejected locally',
);
const day = Date.UTC(2026, 9, 16, 12);
const withinDay = [1, 2, 3, 4, 5].map((minutes) => day - minutes * 60_000);
assert(canRecordCommunitySubmission(withinDay, day) === false, 'five submissions in 24 hours block another');
assert(canRecordCommunitySubmission(withinDay.slice(0, 4), day) === true, 'four submissions in 24 hours still allow one');
assert(
  canRecordCommunitySubmission(
    withinDay.map((ts) => ts - COMMUNITY_SUBMISSION_WINDOW_MS),
    day,
  ) === true,
  'submissions older than 24 hours do not count',
);
equal(pruneCommunitySubmissionTimes([day + 60_000, day - 60_000], day).length, 1, 'future timestamps are ignored');
const autoPublish = parsePatternAiReview({
  isValidCrochet: true,
  confidence: 80,
  rejectionReason: null,
  title: 'Market bag',
  hookSize: '5.0 mm',
  yarnWeight: 'worsted',
  steps: ['Rnd 1: 6 sc in mr'],
});
assert(autoPublish != null && communityPublishStatus(autoPublish) === 'published', 'confident crochet is auto-published');
const unsure = parsePatternAiReview({
  isValidCrochet: true,
  confidence: 79,
  rejectionReason: null,
  title: 'Market bag',
  hookSize: '5.0 mm',
  yarnWeight: 'worsted',
  steps: ['Rnd 1: 6 sc in mr'],
});
assert(unsure != null && communityPublishStatus(unsure) === 'rejected', 'low confidence stays out of the public feed');
const flagged = parsePatternAiReview({
  isValidCrochet: false,
  confidence: 99,
  rejectionReason: 'knitting',
  title: 'Sweater',
  hookSize: '',
  yarnWeight: 'worsted',
  steps: ['Row 1: k2 p2'],
});
assert(flagged != null && communityPublishStatus(flagged) === 'rejected', 'flagged text is not published');
assert(
  patternFromCommunitySubmission('community-published-bag', {
    title: 'Crochet market bag',
    steps: ['Row 1: ch 30', 'Row 2: sc across'],
    hookSize: '5.0 mm',
    yarnWeight: 'worsted',
    source: 'facebook',
    videoUrl: 'https://www.facebook.com/watch/?v=445566',
    status: 'published',
  }) != null,
  'published community submission can enter the catalog',
);
assert(
  patternFromCommunitySubmission('community-rejected-bag', {
    title: 'Crochet market bag',
    steps: ['Row 1: ch 30', 'Row 2: sc across'],
    hookSize: '5.0 mm',
    yarnWeight: 'worsted',
    source: 'facebook',
    videoUrl: 'https://www.facebook.com/watch/?v=112233',
    status: 'rejected',
  }) == null,
  'rejected community submission stays out of the catalog',
);
const facebookEmbed = embeddedTutorialUrl('https://www.facebook.com/watch/?v=998877');
assert(facebookEmbed?.includes('facebook.com/plugins/video.php') === true, 'facebook watch url uses the video plugin');
assert(
  facebookEmbed?.includes(encodeURIComponent('https://www.facebook.com/watch/?v=998877')) === true,
  'facebook plugin keeps the watch link',
);
assert(!communityPattern?.steps?.some((step) => step.includes('@')), 'community steps drop email addresses');
assert(
  patternFromCommunitySubmission('community-empty', {
    title: 'Missing steps',
    steps: [],
    hookSize: '5.0 mm',
    yarnWeight: 'worsted',
    source: 'web',
    videoUrl: 'https://example.com/pattern.mp4',
    status: 'pending',
  }) == null,
  'submission without steps is rejected',
);

const mergedCommunity = mergeCommunityPatterns(seed.patterns, [communityPattern!, communityPattern!]);
equal(mergedCommunity.length, seed.patterns.length + 1, 'community merge adds one new pattern');
equal(mergeCommunityPatterns(mergedCommunity, [communityPattern!]).length, mergedCommunity.length, 'community merge dedupes');
const assembled = assemblePatternCatalog(seed.patterns, mergedCommunity, [communityPattern!]);
equal(assembled.length, seed.patterns.length + 1, 'catalog assembly keeps community rows and dedupes');

const repairedFacebook = repairPersisted(
  {
    patterns: [
      {
        id: 'community-bobble',
        title: 'Bobble border',
        creator: 'Community',
        youtubeUrl: '',
        videoId: '',
        thumbnailUrl: '',
        difficulty: 'easy',
        yarnWeight: 'worsted',
        hookSize: '5.0 mm',
        totalRows: 2,
        stitchesPerRow: 10,
        tags: ['community'],
        bookmarks: [],
        videoUrl: 'https://www.facebook.com/watch/?v=123456',
        source: 'facebook',
        steps: ['Row 1: ch 20', 'Row 2: sc across'],
      },
    ],
  },
  t0,
);
equal(repairedFacebook?.patterns[0]?.source, 'facebook', 'repair keeps a non-youtube tutorial');
equal(repairedFacebook?.patterns[0]?.steps?.[0], 'Row 1: ch 20', 'repair keeps stitch steps');
const repairedSeed = repairPersisted({ patterns: [seed.patterns[0]] }, t0);
equal(repairedSeed?.patterns[0]?.videoId, seed.patterns[0]?.videoId, 'repair still accepts bundled youtube patterns');

const keptImport = reconcilePatternCatalog(
  [communityPattern!, ...seed.patterns],
  seed.patterns,
  seed.patterns,
  new Set(),
);
assert(keptImport.some((pattern) => pattern.id === communityPattern!.id), 'local community import survives catalog refresh');

const parsedSubmission = parseCommunityDocument('projects/demo/databases/(default)/documents/community_submissions/abc', {
  title: { stringValue: 'Shared market bag' },
  steps: { arrayValue: { values: [{ stringValue: 'Row 1: ch 30' }] } },
  hookSize: { stringValue: '5.0 mm' },
  yarnWeight: { stringValue: 'worsted' },
  source: { stringValue: 'facebook' },
  videoUrl: { stringValue: 'https://www.facebook.com/watch/?v=445566' },
  status: { stringValue: 'pending' },
});
equal(parsedSubmission?.title, 'Shared market bag', 'firestore submission parser reads title');
assert(parseCommunityDocument('projects/demo/databases/(default)/documents/community_submissions/nope', {
  title: { stringValue: '' },
  steps: { arrayValue: { values: [] } },
  source: { stringValue: 'web' },
  videoUrl: { stringValue: 'https://example.com/a.mp4' },
}) == null, 'firestore parser rejects a title-less submission');

const beanie = mapExtractedPattern(
  {
    title: 'Easy Crochet Beanie Tutorial for Beginners',
    creator: 'VivCrochets',
    description: 'A chunky beanie worked in rounds with a 6 mm hook.',
  },
  {
    isValidCrochet: true,
    confidence: 92,
    difficulty: 'Easy',
    yarnWeight: 'chunky',
    hookSize: '5.0 mm',
    tools: [{ type: 'crochet hook', size: '6.0 mm' }],
    totalRows: 42,
    stitchesPerRow: 48,
    tags: ['beanie', 'wearables'],
    keyStitches: ['single crochet'],
    summary: 'A beginner chunky beanie in continuous rounds.',
    steps: ['Rnd 1: 8 sc in a magic ring'],
    chapters: [{ label: 'Round 1', time: '0:58' }],
  },
  [],
);
equal(beanie.title, 'Easy Crochet Beanie Tutorial for Beginners', 'upload keeps the YouTube title');
equal(beanie.creator, 'VivCrochets', 'upload keeps the channel name');
equal(beanie.hookSize, '6.0 mm', 'hook size comes from the tool list');
equal(beanie.yarnWeight, 'bulky', 'chunky yarn maps to bulky');
equal(beanie.totalRows, 42, 'extracted row count is kept');
equal(beanie.stitchesPerRow, 48, 'extracted stitch count is kept');
assert(beanie.tags.includes('beanie') && beanie.tags.includes('wearables'), 'extracted tags are kept');
equal(beanie.steps[0], 'Rnd 1: 8 sc in a magic ring', 'extracted stitch lines are kept');
assert(beanie.bookmarks.some((bookmark) => bookmark.seconds === 58), 'chapter time becomes a bookmark');
assert(acceptsCrochetExtraction({ isValidCrochet: true, confidence: 80 }) === true, 'confident crochet extraction is accepted');
assert(acceptsCrochetExtraction({ isValidCrochet: true, confidence: 79 }) === false, 'low-confidence extraction is rejected');
assert(acceptsCrochetExtraction({ isValidCrochet: false, confidence: 99 }) === false, 'a non-crochet payload is rejected');
equal(
  uploadYoutubeSnippetRejection({ title: 'Knitting pattern for a hat', description: 'Needles and yarn.', channelTitle: 'Wool' }),
  'knitting',
  'knitting titles are rejected before Gemini',
);
equal(
  uploadYoutubeSnippetRejection({
    title: 'Crochet beanie',
    description: 'Short note.',
    channelTitle: 'VivCrochets',
    defaultAudioLanguage: 'es',
  }),
  'language',
  'non-English audio is rejected before Gemini',
);
assert(
  uploadYoutubeSnippetRejection({
    title: 'Easy Crochet Beanie',
    description: 'A short English description.',
    channelTitle: 'VivCrochets',
    defaultAudioLanguage: 'en',
  }) == null,
  'a short English description still reaches Gemini',
);
assert(
  uploadYoutubeSnippetRejection({
    title: 'the EASIEST way to crochet the magic circle for beginners',
    description: 'How to crochet a magic ring step by step.',
    channelTitle: 'ElyseCrochets 💌',
    defaultAudioLanguage: 'en',
  }) == null,
  'emoji in a channel name does not block an English tutorial',
);
assert(
  isEnglishFeedPattern({
    title: 'Crochet This Cute Acorn in Minutes!🍂 Beginner Friendly',
    creator: 'Gul\u2019s Cozy Crochet',
  }),
  'typographic apostrophe in creator name still shows in the feed',
);
assert(
  isValidEnglishYoutubeSnippet({
    title: 'Easy Crochet Beanie',
    description: 'A short English description.',
    channelTitle: 'VivCrochets',
    defaultAudioLanguage: 'en',
  }) === false,
  'the catalog scraper still requires a long description',
);

const repairedMembership = repairPersisted(
  {
    account: {
      uid: 'user-1',
      email: 'nick@example.com',
      displayName: 'Nick',
      username: 'nick',
      bio: '',
      avatarColor: '#2F6B4F',
      updatedAt: t0,
    },
    patterns: [],
    projects: [],
    yarnStash: [],
  },
  t0,
);
equal(repairedMembership?.account?.membershipTier, 'basic', 'missing tier repairs to basic');
equal(repairedMembership?.account?.dailyUploadCount, 0, 'missing upload count repairs to 0');
equal(repairedMembership?.account?.lastUploadDate, null, 'missing upload date repairs to null');

const premiumStamp = { seconds: 1_700_000_000, nanoseconds: 0 };
const parsedQuota = readUploadQuota({
  membershipTier: 'premium',
  dailyUploadCount: 4,
  lastUploadDate: premiumStamp,
});
equal(parsedQuota.membershipTier, 'premium', 'premium tier survives repair');
equal(parsedQuota.dailyUploadCount, 4, 'upload count survives repair');
equal(parsedQuota.lastUploadDate, 1_700_000_000_000, 'timestamp seconds become epoch ms');
const resolved = resolveUploadQuota([
  { membershipTier: 'basic', dailyUploadCount: 2, lastUploadDate: t0 },
  { membershipTier: 'premium' },
]);
equal(resolved.membershipTier, 'premium', 'premium on a later source keeps the tier');
equal(resolved.dailyUploadCount, 2, 'earlier source keeps the counter');

const quotaNow = Date.UTC(2026, 0, 2, 12, 0, 0);
let quotaState = applySetAccount(dataFrom(seed), { ...account, ...DEFAULT_UPLOAD_QUOTA });
assert(quotaState, 'account for quota');
for (let upload = 1; upload <= 3; upload += 1) {
  const next = applyRecordUpload(quotaState!, quotaNow + upload);
  assert(next, `basic upload ${upload}`);
  quotaState = next;
  equal(quotaState?.account?.dailyUploadCount, upload, `basic count is ${upload}`);
}
assert(applyRecordUpload(quotaState!, quotaNow + 10) == null, 'fourth basic upload is blocked');
assert(!canUploadToday(quotaState!.account, quotaNow + 10), 'basic gate closes at 3');
assert(decideUploadAccess(quotaState!.account, true, quotaNow + 10) === 'limit', 'signed-in basic member sees the paywall');
const nextUtcDay = applyRecordUpload(quotaState!, Date.UTC(2026, 0, 3, 0, 30, 0));
equal(nextUtcDay?.account?.dailyUploadCount, 1, 'a new UTC day starts the counter over');

const premiumAccount = {
  ...account,
  membershipTier: 'premium' as const,
  dailyUploadCount: 9,
  lastUploadDate: quotaNow,
};
const premiumState = applySetAccount(dataFrom(seed), premiumAccount);
assert(canUploadToday(premiumState?.account ?? null, quotaNow), 'premium bypasses the daily cap');
assert(applyRecordUpload(premiumState!, quotaNow) == null, 'premium does not increment the counter');
equal(premiumState?.account?.dailyUploadCount, 9, 'premium counter stays put');
const mirrored = applyUploadQuota(premiumState!, { membershipTier: 'premium', dailyUploadCount: 9, lastUploadDate: quotaNow });
assert(mirrored == null, 'identical server quota is not rewritten');
assert(decideUploadAccess(null, true, quotaNow) === 'sign-in', 'cloud uploads require a profile');
assert(decideUploadAccess(null, false, quotaNow) === 'allow', 'local mode can save without a profile');

const fromProfileDoc = resolveUploadQuota([
  { membershipTier: 'basic', dailyUploadCount: 3, lastUploadDate: quotaNow },
]);
equal(fromProfileDoc.dailyUploadCount, 3, 'top-level profile quota is preserved on hydrate');

console.log('crochet machine checks passed');
