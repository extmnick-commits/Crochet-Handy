/**
 * Pure crochet state machine.
 *
 * Nothing in here touches React, Zustand, or storage. The store applies these
 * transitions and persists the result. Returning `null` means "no change" —
 * callers skip `setState`, so a no-op tap doesn't write to disk.
 *
 * Timer: elapsed time is `accumulatedSeconds` plus, while running, the wall
 * clock since `timerStartedAt`. A locked phone or a backgrounded tab does not
 * tick an interval; the next read just subtracts timestamps.
 *
 * Counter: one tap is one stitch. When auto-advance is on, the tap that
 * reaches `stitchesPerRow` finishes the row and lands on stitch 0 of the next
 * one. The last row stays full (36/36) instead of opening a row past
 * `totalRows`. Turn auto-advance off to stop at the end of the row.
 */
import { formatBookmarkTime, isEstimatedBookmarkSet, sanitizeVideoBookmarks, type VideoBookmark } from '../utils/chapters';
import {
  cleanPatternText,
  detectPatternVideo,
  isPatternVideoSource,
  normalizeHttpUrl,
  type PatternVideoSource,
} from '../utils/patternAiParser';
import { reviewCrochetPattern } from '../utils/crochetReview';
import { isEnglishFeedPattern } from '../utils/patternEnglishFilter';
import { parseYouTubeUrl } from '../utils/youtube';

export type { PatternVideoSource } from '../utils/patternAiParser';

export type { VideoBookmark } from '../utils/chapters';

export const MAX_TAP_HISTORY = 30;
export const MAX_COUNT = 9999;
/** Skeins of one color the stash stepper will count up to. */
export const MAX_SKEINS = 48;
/** Color swatches saved on a project (palette under the counter). */
export const MAX_PROJECT_YARN_COLORS = 4;
/** Saved tutorial seek points per project. */
export const MAX_VIDEO_CHECKPOINTS = 24;
/** Stills kept per project so a story reel stays a row-by-row timelapse. */
export const MAX_PROGRESS_PHOTOS = 24;
const MAX_PHOTO_URI = 500_000;
const MAX_ROW_NOTE_CHARS = 240;
const MAX_CHECKPOINT_LABEL_CHARS = 48;
const MAX_USERNAME_CHARS = 32;
const MAX_BIO_CHARS = 240;
const MAX_FOLDER_NAME_CHARS = 64;
const MAX_FOLDER_DESC_CHARS = 240;
const MAX_IDEA_FOLDERS = 48;
const MAX_PATTERN_COMMENT_BODY_CHARS = 500;
const MAX_PATTERN_COMMENTS = 240;
/** Caps a corrupted timestamp that landed in the seconds field (~11 years). */
const MAX_ACCUMULATED_SECONDS = 100_000 * 60 * 60;

export const YARN_WEIGHTS = [
  'lace',
  'fingering',
  'sport',
  'dk',
  'worsted',
  'aran',
  'bulky',
  'super-bulky',
  'jumbo',
] as const;

export type YarnWeight = (typeof YARN_WEIGHTS)[number];

export type PatternDifficulty = 'beginner' | 'easy' | 'intermediate' | 'advanced';

export type ProjectStatus = 'in-progress' | 'finished';

export type YarnStashItem = {
  id: string;
  hexColor: string;
  brand: string;
  colorName: string;
  yarnWeight: YarnWeight;
  hookSize: string;
  /** How many skeins of this color are on the shelf. */
  skeinCount: number;
};

export type ProjectYarnColor = {
  id: string;
  hexColor: string;
  label: string;
};

export type VideoCheckpoint = {
  id: string;
  label: string;
  timestampSeconds: number;
};

/** Quick chips stamped on a progress still. Unknown values are dropped on save. */
export const MILESTONE_TAGS = [
  'First Row',
  'Color Change',
  'Halfway',
  'Bind Off',
  'Finished Piece',
  'WIP Check',
  'Finished!',
] as const;

export type MilestoneTag = (typeof MILESTONE_TAGS)[number];

/**
 * One still in a project's progress journal.
 * The sticker fields are frozen at capture time so later rows don't rewrite the past.
 * Newer journal fields are optional so photos saved before them still load.
 */
export type ProgressPhoto = {
  id: string;
  projectId: string;
  /** Compressed data URL, or a device file URI when that is all the picker returned. */
  uri: string;
  projectName: string;
  row: number;
  totalRows: number;
  percent: number;
  elapsedSeconds: number;
  hookSize: string;
  /**
   * Epoch milliseconds. ISO strings are accepted on input and repaired back to this
   * number; read them with `progressPhotoCreatedAtIso`.
   */
  createdAt: number;
  /** Short reflection frozen at capture time. */
  caption?: string;
  /** Same reflection when the maker wrote a note. Omitted on legacy stills. */
  note?: string;
  /** Row counter snapshot. Mirrors `row` on new stills; omitted on legacy stills. */
  rowNumber?: number;
  /** Stitch counter snapshot. Omitted when the still was saved before this field. */
  stitchCount?: number;
  /** Project timer snapshot in seconds. Omitted on legacy stills. */
  sessionDurationSeconds?: number;
  milestoneTag?: MilestoneTag;
};

export type MembershipTier = 'basic' | 'premium';

/** Basic membership can create this many pattern or yarn uploads per UTC day. */
export const DAILY_UPLOAD_LIMIT = 3;

export type UploadQuota = {
  membershipTier: MembershipTier;
  /** Uploads already counted on `lastUploadDate`'s UTC day. */
  dailyUploadCount: number;
  /** Epoch milliseconds of the last counted upload. Null until the first one. */
  lastUploadDate: number | null;
};

export const DEFAULT_UPLOAD_QUOTA: UploadQuota = {
  membershipTier: 'basic',
  dailyUploadCount: 0,
  lastUploadDate: null,
};

export type UserAccount = {
  uid: string;
  email: string;
  displayName: string;
  username: string;
  bio: string;
  avatarColor: string;
  updatedAt: number;
  membershipTier: MembershipTier;
  dailyUploadCount: number;
  lastUploadDate: number | null;
};

export type UploadAccess = 'allow' | 'sign-in' | 'limit';

export type IdeaFolder = {
  id: string;
  name: string;
  description: string;
  patternIds: string[];
  createdAt: number;
  updatedAt: number;
  /** Instant-save target; at most one folder should be marked default. */
  isDefault?: boolean;
  /** Private collections show a lock in the picker. */
  isPrivate?: boolean;
};

export const DEFAULT_COLLECTION_FOLDER_ID = 'folder-default';
export const DEFAULT_COLLECTION_NAME = 'Default Collection';

export type CrochetPattern = {
  id: string;
  title: string;
  creator: string;
  youtubeUrl: string;
  videoId: string;
  thumbnailUrl: string;
  difficulty: PatternDifficulty;
  yarnWeight: YarnWeight;
  hookSize: string;
  totalRows: number;
  stitchesPerRow: number;
  tags: string[];
  /** Short detail-screen blurb; full copy lives in seed `description` / extended meta. */
  summary?: string;
  /** Seek points parsed from the tutorial description or generated for the pattern. */
  bookmarks: VideoBookmark[];
  /** Facebook, blog, or file URL when the tutorial is not only a YouTube id. */
  videoUrl?: string;
  /** Set on imports and community catalog entries. Omitted on bundled seed rows. */
  source?: PatternVideoSource;
  /** Cleaned stitch lines shared with the community catalog. */
  steps?: string[];
};

export type PatternComment = {
  id: string;
  patternId: string;
  authorName: string;
  authorUsername: string;
  avatarColor: string;
  rating: number;
  body: string;
  createdAt: number;
  pinned?: boolean;
  photoUri?: string;
};

export type CrochetProject = {
  id: string;
  name: string;
  patternId: string | null;
  status: ProjectStatus;
  currentStitch: number;
  stitchesPerRow: number;
  currentRow: number;
  totalRows: number;
  /** Millimeter hook on this make, e.g. `4.0 mm`. Copied from the pattern when the project is created. */
  hookSize: string;
  yarnWeight: YarnWeight;
  /** Epoch ms when the current running segment began. Null while paused. */
  timerStartedAt: number | null;
  /** Seconds already banked from earlier segments. Does not include the live one. */
  accumulatedSeconds: number;
  /** Up to four palette swatches for this make (not tied to stash inventory). */
  yarnColors: ProjectYarnColor[];
  /** Stitch repeat or row formula visible under the counter. */
  rowNote: string;
  /** Tappable moments in the linked tutorial video. */
  checkpoints: VideoCheckpoint[];
  createdAt: number;
  updatedAt: number;
};

/** One counter tap, stored so a double-tap can be undone. Not persisted. */
export type CounterSnapshot = {
  currentStitch: number;
  currentRow: number;
};

export type CrochetData = {
  patterns: CrochetPattern[];
  projects: CrochetProject[];
  activeProjectId: string | null;
  yarnStash: YarnStashItem[];
  progressPhotos: ProgressPhoto[];
  account: UserAccount | null;
  likedPatternIds: string[];
  /** Patterns saved to the user's general library (Collections → Patterns). */
  collectedPatternIds: string[];
  collectionFolders: IdeaFolder[];
  patternComments: PatternComment[];
  /** Display names of creators the user follows from the pattern detail header. */
  followedCreators: string[];
  tapHistory: Record<string, CounterSnapshot[]>;
};

export type CrochetPersistedSlice = {
  patterns: CrochetPattern[];
  projects: CrochetProject[];
  activeProjectId: string | null;
  yarnStash: YarnStashItem[];
  progressPhotos: ProgressPhoto[];
  account: UserAccount | null;
  likedPatternIds: string[];
  collectedPatternIds: string[];
  collectionFolders: IdeaFolder[];
  patternComments: PatternComment[];
  followedCreators: string[];
};

export type NewPatternInput = {
  title: string;
  creator?: string;
  youtubeUrl: string;
  difficulty?: PatternDifficulty;
  yarnWeight?: YarnWeight;
  hookSize?: string;
  totalRows?: number;
  stitchesPerRow?: number;
  tags?: string[];
  summary?: string;
  bookmarks?: VideoBookmark[];
  videoUrl?: string;
  source?: PatternVideoSource;
  steps?: string[];
};

export type CommunityCatalogSubmission = {
  title: string;
  steps: readonly string[];
  hookSize: string;
  yarnWeight: string;
  source: PatternVideoSource;
  videoUrl: string;
  status?: string;
};

export type CreateProjectInput = {
  name: string;
  patternId?: string | null;
};

export type NewYarnInput = {
  hexColor: string;
  brand: string;
  colorName: string;
  yarnWeight: YarnWeight;
  hookSize?: string;
  skeinCount?: number;
};

export type NewProjectYarnColorInput = {
  hexColor: string;
  label: string;
};

export type ProjectYarnColorPatch = Partial<Omit<ProjectYarnColor, 'id'>>;

export type NewVideoCheckpointInput = {
  label: string;
  timestampSeconds: number;
};

export type NewProgressPhotoInput = {
  projectId: string;
  uri: string;
  projectName: string;
  row: number;
  totalRows: number;
  percent: number;
  elapsedSeconds: number;
  hookSize: string;
  /** Epoch ms, or an ISO timestamp repaired to epoch ms. */
  createdAt?: number | string;
  caption?: string;
  note?: string;
  rowNumber?: number;
  stitchCount?: number;
  sessionDurationSeconds?: number;
  milestoneTag?: string;
};

export type YarnStashPatch = Partial<Omit<YarnStashItem, 'id'>>;

export type NewPatternCommentInput = {
  patternId: string;
  authorName: string;
  authorUsername?: string;
  avatarColor?: string;
  rating: number;
  body: string;
  photoUri?: string;
};

const YARN_WEIGHT_SET: ReadonlySet<string> = new Set(YARN_WEIGHTS);
const DIFFICULTIES: ReadonlySet<string> = new Set(['beginner', 'easy', 'intermediate', 'advanced']);
const EMPTY_HISTORY: CounterSnapshot[] = [];

export function isYarnWeight(value: unknown): value is YarnWeight {
  return typeof value === 'string' && YARN_WEIGHT_SET.has(value);
}

export function createId(prefix: string): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `${prefix}-${uuid}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeHex(input: string): string | null {
  const match = input.trim().match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  const digits = match?.[1];
  if (!digits) return null;
  const expanded = digits.length === 3 ? [...digits].map((char) => char + char).join('') : digits;
  return `#${expanded.toUpperCase()}`;
}

export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

/** Round to the nearest millisecond so pause/resume doesn't sprinkle float dust. */
export function bankSeconds(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const capped = Math.min(value, MAX_ACCUMULATED_SECONDS);
  return Math.round(capped * 1000) / 1000;
}

export function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

/** `MM:SS` / `H:MM:SS` for checkpoint pills (e.g. `01:15`). */
export function formatCheckpointTime(totalSeconds: number): string {
  return formatBookmarkTime(totalSeconds);
}

export function activeProject(data: CrochetData): CrochetProject | null {
  if (!data.activeProjectId) return null;
  return data.projects.find((project) => project.id === data.activeProjectId) ?? null;
}

/**
 * Whole seconds of project time at `now`.
 * Safe to call after hours in the background — it does not depend on a timer firing.
 */
export function elapsedSeconds(project: CrochetProject, now = Date.now()): number {
  const banked = bankSeconds(project.accumulatedSeconds);
  if (project.timerStartedAt == null || !Number.isFinite(project.timerStartedAt)) return banked;
  const delta = (now - project.timerStartedAt) / 1000;
  if (!Number.isFinite(delta) || delta <= 0) return banked;
  return bankSeconds(banked + delta);
}

export function elapsedWholeSeconds(project: CrochetProject, now = Date.now()): number {
  return Math.floor(elapsedSeconds(project, now));
}

/** `HH:MM:SS`, hours padded until they pass 99 so the timer doesn't change width. */
export function formatElapsed(totalSeconds: number): string {
  const safe = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0;
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const hh = hours < 100 ? String(hours).padStart(2, '0') : String(hours);
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export function isTimerRunning(project: CrochetProject): boolean {
  return project.timerStartedAt != null && Number.isFinite(project.timerStartedAt);
}

/** Stitches already made: full rows behind the hook, plus the current row. */
export function stitchesDone(project: Pick<CrochetProject, 'currentRow' | 'currentStitch' | 'stitchesPerRow'>): number {
  const done = (project.currentRow - 1) * project.stitchesPerRow + project.currentStitch;
  if (!Number.isFinite(done) || done <= 0) return 0;
  return Math.min(MAX_COUNT * MAX_COUNT, Math.trunc(done));
}

/** Headline percent used on the dashboard and the progress sticker. 28 of 40 is 70. */
export function rowPercent(project: Pick<CrochetProject, 'currentRow' | 'totalRows'>): number {
  if (project.totalRows <= 0) return 0;
  return clampPercent((project.currentRow / project.totalRows) * 100);
}

/** Fraction of the project's stitch grid that is already done, from 0 to 1. */
export function projectProgress(project: CrochetProject): number {
  const total = project.totalRows * project.stitchesPerRow;
  if (total <= 0) return 0;
  return Math.min(1, Math.max(0, stitchesDone(project) / total));
}

/**
 * If the device clock jumped backwards, a running segment would freeze until
 * wall time caught the old anchor, then leap forward. Slide that anchor to
 * `now` so the timer keeps counting without inventing the missing seconds.
 */
export function reconcileProjectClock(project: CrochetProject, now: number): CrochetProject {
  const accumulatedSeconds = bankSeconds(project.accumulatedSeconds);
  let timerStartedAt = project.timerStartedAt;
  if (timerStartedAt != null && !Number.isFinite(timerStartedAt)) timerStartedAt = null;
  else if (timerStartedAt != null && timerStartedAt > now) timerStartedAt = now;

  if (accumulatedSeconds === project.accumulatedSeconds && timerStartedAt === project.timerStartedAt) {
    return project;
  }
  return { ...project, accumulatedSeconds, timerStartedAt };
}

export function applyReconcileTimers(data: CrochetData, now: number): CrochetData | null {
  let changed = false;
  const projects = data.projects.map((project) => {
    const next = reconcileProjectClock(project, now);
    if (next !== project) changed = true;
    return next;
  });
  return changed ? { ...data, projects } : null;
}

export function pauseProjectTimer(project: CrochetProject, now: number): CrochetProject {
  const reconciled = reconcileProjectClock(project, now);
  if (reconciled.timerStartedAt == null) return reconciled;
  const deltaSeconds = Math.max(0, (now - reconciled.timerStartedAt) / 1000);
  return {
    ...reconciled,
    accumulatedSeconds: bankSeconds(reconciled.accumulatedSeconds + deltaSeconds),
    timerStartedAt: null,
    updatedAt: now,
  };
}

export function applyStartTimer(data: CrochetData, now: number): CrochetData | null {
  const current = activeProject(data);
  if (!current || current.status === 'finished') return null;
  const project = reconcileProjectClock(current, now);
  if (project.timerStartedAt != null) {
    return project === current ? null : replaceProject(data, project);
  }
  return replaceProject(data, {
    ...project,
    timerStartedAt: now,
    accumulatedSeconds: bankSeconds(project.accumulatedSeconds),
    updatedAt: now,
  });
}

export function applyPauseTimer(data: CrochetData, now: number): CrochetData | null {
  const current = activeProject(data);
  if (!current) return null;
  const paused = pauseProjectTimer(current, now);
  return paused === current ? null : replaceProject(data, paused);
}

export function applyResetTimer(data: CrochetData, now: number): CrochetData | null {
  const project = activeProject(data);
  if (!project) return null;
  if (project.timerStartedAt == null && project.accumulatedSeconds === 0) return null;
  return replaceProject(data, {
    ...project,
    timerStartedAt: null,
    accumulatedSeconds: 0,
    updatedAt: now,
  });
}

export function applyToggleTimer(data: CrochetData, now: number): CrochetData | null {
  const project = activeProject(data);
  if (!project) return null;
  if (project.timerStartedAt != null) return applyPauseTimer(data, now);
  return applyStartTimer(data, now);
}

export function applyIncrementStitch(
  data: CrochetData,
  now: number,
  autoAdvance?: boolean,
): CrochetData | null {
  const project = activeProject(data);
  if (!project || project.stitchesPerRow < 1) return null;
  const shouldAdvance = autoAdvance !== false;
  const nextStitch = project.currentStitch + 1;

  // This tap is the last stitch of the row.
  if (shouldAdvance && nextStitch >= project.stitchesPerRow) {
    if (project.currentRow >= project.totalRows) {
      if (project.currentStitch >= project.stitchesPerRow) return null;
      return commitCounter(data, project, now, { currentStitch: project.stitchesPerRow });
    }
    return commitCounter(data, project, now, {
      currentRow: project.currentRow + 1,
      currentStitch: 0,
    });
  }

  if (project.currentStitch >= project.stitchesPerRow) return null;
  return commitCounter(data, project, now, { currentStitch: nextStitch });
}

export function applyDecrementStitch(data: CrochetData, now: number): CrochetData | null {
  const project = activeProject(data);
  if (!project) return null;
  if (project.currentStitch > 0) {
    return commitCounter(data, project, now, { currentStitch: project.currentStitch - 1 });
  }
  // Stitch 0 means the previous row's last stitch rolled over. Step back to
  // the stitch that was on the hook before that tap.
  if (project.currentRow <= 1) return null;
  return commitCounter(data, project, now, {
    currentRow: project.currentRow - 1,
    currentStitch: Math.max(project.stitchesPerRow - 1, 0),
  });
}

export function applyIncrementRow(data: CrochetData, now: number): CrochetData | null {
  const project = activeProject(data);
  if (!project || project.currentRow >= project.totalRows) return null;
  return commitCounter(data, project, now, {
    currentRow: project.currentRow + 1,
    currentStitch: 0,
  });
}

export function applyDecrementRow(data: CrochetData, now: number): CrochetData | null {
  const project = activeProject(data);
  if (!project || project.currentRow <= 1) return null;
  return commitCounter(data, project, now, {
    currentRow: project.currentRow - 1,
    currentStitch: 0,
  });
}

export function applyUndoLastTap(data: CrochetData, now: number): CrochetData | null {
  const project = activeProject(data);
  if (!project) return null;
  const history = data.tapHistory[project.id] ?? EMPTY_HISTORY;
  const snapshot = history[history.length - 1];
  if (!snapshot) return null;

  const currentRow = clampInt(snapshot.currentRow, 1, project.totalRows);
  const currentStitch = clampInt(snapshot.currentStitch, 0, project.stitchesPerRow);
  const nextHistory = history.slice(0, -1);
  const nextProject =
    currentRow === project.currentRow && currentStitch === project.currentStitch
      ? project
      : { ...project, currentRow, currentStitch, updatedAt: now };

  return {
    ...data,
    projects: data.projects.map((item) => (item.id === project.id ? nextProject : item)),
    tapHistory: { ...data.tapHistory, [project.id]: nextHistory },
  };
}

export function applySetStitchesPerRow(data: CrochetData, value: number, now: number): CrochetData | null {
  const project = activeProject(data);
  if (!project || !Number.isFinite(value)) return null;
  const stitchesPerRow = clampInt(value, 1, MAX_COUNT);
  const currentStitch = Math.min(project.currentStitch, stitchesPerRow);
  if (stitchesPerRow === project.stitchesPerRow && currentStitch === project.currentStitch) return null;
  // Old tap snapshots were counted against a different row length.
  return {
    ...replaceProject(data, { ...project, stitchesPerRow, currentStitch, updatedAt: now }),
    tapHistory: { ...data.tapHistory, [project.id]: [] },
  };
}

export function applySetHookAndYarn(
  data: CrochetData,
  patch: { hookSize?: string; yarnWeight?: YarnWeight },
  now: number,
): CrochetData | null {
  const project = activeProject(data);
  if (!project) return null;
  let next = project;
  if (patch.hookSize !== undefined) {
    const hookSize = sanitizeHook(patch.hookSize);
    if (hookSize !== next.hookSize) next = { ...next, hookSize };
  }
  if (patch.yarnWeight !== undefined && isYarnWeight(patch.yarnWeight) && patch.yarnWeight !== next.yarnWeight) {
    next = { ...next, yarnWeight: patch.yarnWeight };
  }
  if (next === project) return null;
  return replaceProject(data, { ...next, updatedAt: now });
}

export function applySetTotalRows(data: CrochetData, value: number, now: number): CrochetData | null {
  const project = activeProject(data);
  if (!project || !Number.isFinite(value)) return null;
  // Never hide progress by shrinking the goal underneath the row you're on.
  const totalRows = clampInt(Math.max(value, project.currentRow), 1, MAX_COUNT);
  if (totalRows === project.totalRows) return null;
  return replaceProject(data, { ...project, totalRows, updatedAt: now });
}

export function applyCreateProject(
  data: CrochetData,
  input: CreateProjectInput,
  id: string,
  now: number,
): CrochetData | null {
  const name = sanitizeName(input.name);
  if (!name || !isSafeId(id)) return null;
  const pattern = input.patternId ? data.patterns.find((item) => item.id === input.patternId) ?? null : null;
  const project: CrochetProject = {
    id,
    name,
    patternId: pattern?.id ?? null,
    status: 'in-progress',
    currentStitch: 0,
    currentRow: 1,
    stitchesPerRow: pattern?.stitchesPerRow ?? 10,
    totalRows: pattern?.totalRows ?? 10,
    hookSize: pattern?.hookSize ?? '',
    yarnWeight: pattern?.yarnWeight ?? 'worsted',
    timerStartedAt: null,
    accumulatedSeconds: 0,
    yarnColors: [],
    rowNote: '',
    checkpoints: [],
    createdAt: now,
    updatedAt: now,
  };
  // Leaving a project banks its open segment so it doesn't keep counting in the drawer.
  const projects = data.projects.map((item) =>
    item.id === data.activeProjectId ? pauseProjectTimer(item, now) : item,
  );
  return {
    ...data,
    projects: [...projects, project],
    activeProjectId: id,
    tapHistory: { ...data.tapHistory, [id]: [] },
  };
}

export function applySetActiveProject(data: CrochetData, projectId: string | null, now: number): CrochetData | null {
  if (projectId === data.activeProjectId) return null;
  if (projectId !== null && !data.projects.some((project) => project.id === projectId)) return null;
  let pausedRunning = false;
  const projects = data.projects.map((project) => {
    if (project.id !== data.activeProjectId) return project;
    const paused = pauseProjectTimer(project, now);
    if (paused !== project) pausedRunning = true;
    return paused;
  });
  return {
    ...data,
    projects: pausedRunning ? projects : data.projects,
    activeProjectId: projectId,
  };
}

export function applyRenameProject(data: CrochetData, name: string, now: number): CrochetData | null {
  const project = activeProject(data);
  const nextName = sanitizeName(name);
  if (!project || !nextName || nextName === project.name) return null;
  return replaceProject(data, { ...project, name: nextName, updatedAt: now });
}

export function applyFinishProject(data: CrochetData, now: number): CrochetData | null {
  const project = activeProject(data);
  if (!project) return null;
  const paused = pauseProjectTimer(project, now);
  if (project.status === 'finished') {
    return paused === project ? null : replaceProject(data, paused);
  }
  return replaceProject(data, { ...paused, status: 'finished', updatedAt: now });
}

export function applyReopenProject(data: CrochetData, now: number): CrochetData | null {
  const project = activeProject(data);
  if (!project || project.status !== 'finished') return null;
  return replaceProject(data, { ...project, status: 'in-progress', updatedAt: now });
}

export function applyDeleteProject(data: CrochetData, projectId: string): CrochetData | null {
  if (!data.projects.some((project) => project.id === projectId)) return null;
  const projects = data.projects.filter((project) => project.id !== projectId);
  const tapHistory = { ...data.tapHistory };
  delete tapHistory[projectId];
  const progressPhotos = data.progressPhotos.filter((photo) => photo.projectId !== projectId);
  const activeProjectId =
    data.activeProjectId === projectId
      ? (projects.find((project) => project.status === 'in-progress')?.id ?? projects[0]?.id ?? null)
      : data.activeProjectId;
  return { ...data, projects, tapHistory, progressPhotos, activeProjectId };
}

export function applyAddPattern(data: CrochetData, id: string, input: NewPatternInput): CrochetData | null {
  const pattern = buildPattern(id, input);
  if (!pattern) return null;
  if (duplicatesPattern(data.patterns, pattern)) return null;
  return { ...data, patterns: [...data.patterns, pattern] };
}

function duplicatesPattern(patterns: CrochetPattern[], pattern: CrochetPattern): boolean {
  return patterns.some((item) => {
    if (pattern.videoId && item.videoId === pattern.videoId) return true;
    if (pattern.videoUrl && item.videoUrl && item.videoUrl === pattern.videoUrl) return true;
    return false;
  });
}

export function applySetPatternBookmarks(
  data: CrochetData,
  patternId: string,
  bookmarks: VideoBookmark[],
): CrochetData | null {
  const pattern = data.patterns.find((item) => item.id === patternId);
  if (!pattern) return null;
  const nextBookmarks = sanitizeVideoBookmarks(bookmarks);
  if (sameBookmarks(pattern.bookmarks, nextBookmarks)) return null;
  return {
    ...data,
    patterns: data.patterns.map((item) => (item.id === patternId ? { ...item, bookmarks: nextBookmarks } : item)),
  };
}

function sameBookmarks(current: VideoBookmark[], next: VideoBookmark[]): boolean {
  if (current.length !== next.length) return false;
  return current.every(
    (item, index) =>
      item.seconds === next[index]?.seconds &&
      item.label === next[index]?.label &&
      item.rowHint === next[index]?.rowHint,
  );
}

export function applyRemovePattern(data: CrochetData, patternId: string, now: number): CrochetData | null {
  if (!data.patterns.some((pattern) => pattern.id === patternId)) return null;
  const likedPatternIds = data.likedPatternIds.filter((id) => id !== patternId);
  const collectedPatternIds = data.collectedPatternIds.filter((id) => id !== patternId);
  const collectionFolders = data.collectionFolders.map((folder) => ({
    ...folder,
    patternIds: folder.patternIds.filter((id) => id !== patternId),
    updatedAt: folder.patternIds.includes(patternId) ? now : folder.updatedAt,
  }));
  const foldersChanged = collectionFolders.some((folder, index) => folder !== data.collectionFolders[index]);
  const patternComments = data.patternComments.filter((comment) => comment.patternId !== patternId);
  const commentsChanged = patternComments.length !== data.patternComments.length;
  return {
    ...data,
    patterns: data.patterns.filter((pattern) => pattern.id !== patternId),
    projects: data.projects.map((project) =>
      project.patternId === patternId ? { ...project, patternId: null, updatedAt: now } : project,
    ),
    likedPatternIds,
    collectedPatternIds,
    collectionFolders: foldersChanged ? collectionFolders : data.collectionFolders,
    ...(commentsChanged ? { patternComments } : {}),
  };
}

export function applySetAccount(data: CrochetData, account: UserAccount | null): CrochetData | null {
  if (account === null && data.account === null) return null;
  if (account !== null && data.account !== null && accountsEqual(data.account, account)) return null;
  return { ...data, account };
}

export function applyUpdateAccountProfile(
  data: CrochetData,
  patch: { displayName?: string; username?: string; bio?: string; avatarColor?: string },
  now: number,
): CrochetData | null {
  if (!data.account) return null;
  let next = data.account;
  let changed = false;
  if (patch.displayName !== undefined) {
    const displayName = sanitizeText(patch.displayName, 80);
    if (!displayName) return null;
    if (displayName !== next.displayName) {
      next = { ...next, displayName };
      changed = true;
    }
  }
  if (patch.username !== undefined) {
    const username = sanitizeUsername(patch.username);
    if (!username) return null;
    if (username !== next.username) {
      next = { ...next, username };
      changed = true;
    }
  }
  if (patch.bio !== undefined) {
    const bio = sanitizeBio(patch.bio);
    if (bio !== next.bio) {
      next = { ...next, bio };
      changed = true;
    }
  }
  if (patch.avatarColor !== undefined) {
    const avatarColor = normalizeHex(patch.avatarColor) ?? next.avatarColor;
    if (avatarColor !== next.avatarColor) {
      next = { ...next, avatarColor };
      changed = true;
    }
  }
  if (!changed) return null;
  return { ...data, account: { ...next, updatedAt: now } };
}

export function applyToggleLikePattern(data: CrochetData, patternId: string): CrochetData | null {
  if (!data.patterns.some((pattern) => pattern.id === patternId)) return null;
  const liked = data.likedPatternIds.includes(patternId);
  const likedPatternIds = liked
    ? data.likedPatternIds.filter((id) => id !== patternId)
    : [...data.likedPatternIds, patternId];
  return { ...data, likedPatternIds };
}

export function applyToggleCollectPattern(data: CrochetData, patternId: string): CrochetData | null {
  if (!data.patterns.some((pattern) => pattern.id === patternId)) return null;
  const collected = data.collectedPatternIds.includes(patternId);
  const collectedPatternIds = collected
    ? data.collectedPatternIds.filter((id) => id !== patternId)
    : [...data.collectedPatternIds, patternId];
  return { ...data, collectedPatternIds };
}

export function applyAddPatternComment(
  data: CrochetData,
  id: string,
  input: NewPatternCommentInput,
  now: number,
): CrochetData | null {
  if (!isSafeId(id) || data.patternComments.length >= MAX_PATTERN_COMMENTS) return null;
  if (data.patternComments.some((comment) => comment.id === id)) return null;
  if (!data.patterns.some((pattern) => pattern.id === input.patternId)) return null;
  const body = sanitizeText(input.body, MAX_PATTERN_COMMENT_BODY_CHARS);
  if (!body) return null;
  const authorName = sanitizeText(input.authorName, 60);
  if (!authorName) return null;
  const authorUsername = sanitizeUsername(input.authorUsername ?? authorName) ?? 'maker';
  const avatarColor = normalizeHex(input.avatarColor ?? '') ?? '#2F6B4F';
  const rating = clampInt(input.rating, 1, 5);
  const photoUri = typeof input.photoUri === 'string' && isCommentPhotoUri(input.photoUri) ? input.photoUri : undefined;
  const comment: PatternComment = {
    id,
    patternId: input.patternId,
    authorName,
    authorUsername,
    avatarColor,
    rating,
    body,
    createdAt: now,
    ...(photoUri ? { photoUri } : {}),
  };
  return { ...data, patternComments: [...data.patternComments, comment] };
}

export function applyRemovePatternComment(data: CrochetData, commentId: string): CrochetData | null {
  if (!data.patternComments.some((comment) => comment.id === commentId)) return null;
  return { ...data, patternComments: data.patternComments.filter((comment) => comment.id !== commentId) };
}

export function applyToggleFollowCreator(data: CrochetData, creator: string): CrochetData | null {
  const name = sanitizeText(creator, 60);
  if (!name) return null;
  const followed = data.followedCreators.includes(name);
  const followedCreators = followed
    ? data.followedCreators.filter((item) => item !== name)
    : [...data.followedCreators, name];
  return { ...data, followedCreators };
}

export function applyCreateCollectionFolder(
  data: CrochetData,
  id: string,
  input: { name: string; description?: string; isPrivate?: boolean },
  now: number,
): CrochetData | null {
  if (!isSafeId(id) || data.collectionFolders.length >= MAX_IDEA_FOLDERS) return null;
  if (data.collectionFolders.some((folder) => folder.id === id)) return null;
  const name = sanitizeText(input.name, MAX_FOLDER_NAME_CHARS);
  if (!name) return null;
  const description = sanitizeFolderDescription(input.description ?? '');
  const folder: IdeaFolder = {
    id,
    name,
    description,
    patternIds: [],
    createdAt: now,
    updatedAt: now,
    isPrivate: Boolean(input.isPrivate),
  };
  const withFolder = applyEnsureDefaultCollectionFolder(
    { ...data, collectionFolders: [...data.collectionFolders, folder] },
    now,
  );
  return withFolder;
}

export function applyEnsureDefaultCollectionFolder(data: CrochetData, now: number): CrochetData {
  let collectionFolders = data.collectionFolders;
  const defaultIndex = collectionFolders.findIndex((folder) => folder.isDefault);
  if (defaultIndex < 0) {
    if (collectionFolders.length === 0) {
      const folder: IdeaFolder = {
        id: DEFAULT_COLLECTION_FOLDER_ID,
        name: DEFAULT_COLLECTION_NAME,
        description: '',
        patternIds: [],
        createdAt: now,
        updatedAt: now,
        isDefault: true,
        isPrivate: false,
      };
      collectionFolders = [folder];
    } else {
      collectionFolders = collectionFolders.map((folder, index) =>
        index === 0 ? { ...folder, isDefault: true } : { ...folder, isDefault: folder.isDefault ?? false },
      );
    }
  } else if (defaultIndex > 0) {
    collectionFolders = collectionFolders.map((folder, index) => ({
      ...folder,
      isDefault: index === defaultIndex,
    }));
  }
  if (collectionFolders === data.collectionFolders) return data;
  return { ...data, collectionFolders };
}

export function applySetPatternInFolders(
  data: CrochetData,
  patternId: string,
  folderIds: string[],
  now: number,
): CrochetData | null {
  if (!data.patterns.some((pattern) => pattern.id === patternId)) return null;
  const validIds = new Set(
    folderIds.filter((id) => data.collectionFolders.some((folder) => folder.id === id)),
  );
  let changed = false;
  const collectionFolders = data.collectionFolders.map((folder) => {
    const has = folder.patternIds.includes(patternId);
    const should = validIds.has(folder.id);
    if (has === should) return folder;
    changed = true;
    const patternIds = should
      ? [...folder.patternIds, patternId]
      : folder.patternIds.filter((id) => id !== patternId);
    return { ...folder, patternIds, updatedAt: now };
  });
  if (!changed) {
    const inAny = data.collectionFolders.some((folder) => folder.patternIds.includes(patternId));
    const shouldBeInAny = validIds.size > 0;
    if (inAny === shouldBeInAny) return null;
  }
  const inAnyFolder = collectionFolders.some((folder) => folder.patternIds.includes(patternId));
  let collectedPatternIds = data.collectedPatternIds;
  if (inAnyFolder && !collectedPatternIds.includes(patternId)) {
    collectedPatternIds = [...collectedPatternIds, patternId];
  } else if (!inAnyFolder && collectedPatternIds.includes(patternId)) {
    collectedPatternIds = collectedPatternIds.filter((id) => id !== patternId);
  }
  return { ...data, collectionFolders, collectedPatternIds };
}

export function applyCollectPatternToDefaultFolder(
  data: CrochetData,
  patternId: string,
  now: number,
): { data: CrochetData; folderName: string } | null {
  if (!data.patterns.some((pattern) => pattern.id === patternId)) return null;
  const ensured = applyEnsureDefaultCollectionFolder(data, now);
  const defaultFolder = ensured.collectionFolders.find((folder) => folder.isDefault);
  if (!defaultFolder) return null;
  const folderIds = ensured.collectionFolders
    .filter((folder) => folder.patternIds.includes(patternId))
    .map((folder) => folder.id);
  if (!folderIds.includes(defaultFolder.id)) {
    folderIds.push(defaultFolder.id);
  }
  const next = applySetPatternInFolders(ensured, patternId, folderIds, now);
  if (!next) {
    if (!ensured.collectionFolders.some((folder) => folder.patternIds.includes(patternId))) return null;
    return { data: ensured, folderName: defaultFolder.name };
  }
  return { data: next, folderName: defaultFolder.name };
}

/** @deprecated Use `applyCreateCollectionFolder`. */
export const applyCreateIdeaFolder = applyCreateCollectionFolder;

export function applyRenameCollectionFolder(
  data: CrochetData,
  folderId: string,
  name: string,
  now: number,
): CrochetData | null {
  return applyUpdateCollectionFolder(data, folderId, { name }, now);
}

export function applyUpdateCollectionFolder(
  data: CrochetData,
  folderId: string,
  patch: { name?: string; description?: string },
  now: number,
): CrochetData | null {
  const index = data.collectionFolders.findIndex((folder) => folder.id === folderId);
  if (index < 0) return null;
  const current = data.collectionFolders[index];
  let next = current;
  if (patch.name !== undefined) {
    const nextName = sanitizeText(patch.name, MAX_FOLDER_NAME_CHARS);
    if (!nextName || nextName === next.name) return null;
    next = { ...next, name: nextName };
  }
  if (patch.description !== undefined) {
    const description = sanitizeFolderDescription(patch.description);
    if (description === next.description) return null;
    next = { ...next, description };
  }
  if (next === current) return null;
  const collectionFolders = [...data.collectionFolders];
  collectionFolders[index] = { ...next, updatedAt: now };
  return { ...data, collectionFolders };
}

/** @deprecated Use `applyUpdateCollectionFolder`. */
export const applyUpdateIdeaFolder = applyUpdateCollectionFolder;

export function applyDeleteCollectionFolder(data: CrochetData, folderId: string): CrochetData | null {
  if (!data.collectionFolders.some((folder) => folder.id === folderId)) return null;
  return { ...data, collectionFolders: data.collectionFolders.filter((folder) => folder.id !== folderId) };
}

/** @deprecated Use `applyDeleteCollectionFolder`. */
export const applyDeleteIdeaFolder = applyDeleteCollectionFolder;

export function applyTogglePatternInFolder(
  data: CrochetData,
  folderId: string,
  patternId: string,
  now: number,
): CrochetData | null {
  if (!data.patterns.some((pattern) => pattern.id === patternId)) return null;
  const index = data.collectionFolders.findIndex((folder) => folder.id === folderId);
  if (index < 0) return null;
  const folder = data.collectionFolders[index];
  const has = folder.patternIds.includes(patternId);
  const patternIds = has ? folder.patternIds.filter((id) => id !== patternId) : [...folder.patternIds, patternId];
  const collectionFolders = [...data.collectionFolders];
  collectionFolders[index] = { ...folder, patternIds, updatedAt: now };
  let collectedPatternIds = data.collectedPatternIds;
  if (!has && !collectedPatternIds.includes(patternId)) {
    collectedPatternIds = [...collectedPatternIds, patternId];
  }
  return { ...data, collectionFolders, collectedPatternIds };
}

/** Firestore doc size guard — keep newest progress stills that fit under this budget. */
export const MAX_FIRESTORE_PROGRESS_PHOTO_BYTES = 450_000;

export function mergeProjectsByUpdatedAt(local: CrochetProject[], cloud: CrochetProject[]): CrochetProject[] {
  const byId = new Map<string, CrochetProject>();
  for (const project of local) byId.set(project.id, project);
  for (const project of cloud) {
    const existing = byId.get(project.id);
    if (!existing || project.updatedAt >= existing.updatedAt) byId.set(project.id, project);
  }
  return dedupeById([...byId.values()]);
}

export function mergeYarnStashById(local: YarnStashItem[], cloud: YarnStashItem[]): YarnStashItem[] {
  const byId = new Map<string, YarnStashItem>();
  for (const item of local) byId.set(item.id, item);
  for (const item of cloud) byId.set(item.id, item);
  return dedupeById([...byId.values()]);
}

export function mergeProgressPhotosById(local: ProgressPhoto[], cloud: ProgressPhoto[]): ProgressPhoto[] {
  const byId = new Map<string, ProgressPhoto>();
  for (const photo of local) byId.set(photo.id, photo);
  for (const photo of cloud) byId.set(photo.id, photo);
  return sortPhotos(dedupeById([...byId.values()])).slice(-MAX_PROGRESS_PHOTOS * 8);
}

function resolveActiveProjectId(
  localId: string | null,
  cloudId: string | null,
  projects: CrochetProject[],
): string | null {
  const ids = new Set(projects.map((project) => project.id));
  if (cloudId && ids.has(cloudId)) return cloudId;
  if (localId && ids.has(localId)) return localId;
  return projects.find((project) => project.status === 'in-progress')?.id ?? projects[0]?.id ?? null;
}

/** Trim progress stills so a Firestore user doc stays under the 1 MiB cap. */
export function fitProgressPhotosForFirestore(
  photos: ProgressPhoto[],
  maxBytes = MAX_FIRESTORE_PROGRESS_PHOTO_BYTES,
): ProgressPhoto[] {
  const ordered = [...sortPhotos(photos)].reverse();
  const kept: ProgressPhoto[] = [];
  let bytes = 0;
  for (const photo of ordered) {
    const estimate = photo.uri.length + 320;
    if (bytes + estimate > maxBytes && kept.length > 0) continue;
    if (estimate > maxBytes) continue;
    kept.push(photo);
    bytes += estimate;
  }
  return sortPhotos(kept);
}

export function fitCrochetPersistedSliceForFirestore(slice: CrochetPersistedSlice): CrochetPersistedSlice {
  const progressPhotos = fitProgressPhotosForFirestore(slice.progressPhotos);
  return progressPhotos.length === slice.progressPhotos.length ? slice : { ...slice, progressPhotos };
}

export function applyHydrateCloudSlice(
  data: CrochetData,
  cloudRaw: unknown,
  seedCatalog: CrochetPattern[],
  now: number,
): CrochetData | null {
  const repaired = repairPersisted(cloudRaw, now);
  if (!repaired) return null;
  const retain = collectReferencedPatternIds(repaired);
  const patterns = reconcilePatternCatalog(repaired.patterns, seedCatalog, [], retain);
  const patternIds = new Set(patterns.map((pattern) => pattern.id));
  const likedPatternIds = repaired.likedPatternIds.filter((id) => patternIds.has(id));
  const collectedPatternIds = repaired.collectedPatternIds.filter((id) => patternIds.has(id));
  const collectionFolders = repaired.collectionFolders.map((folder) => ({
    ...folder,
    patternIds: folder.patternIds.filter((id) => patternIds.has(id)),
  }));
  const projects = mergeProjectsByUpdatedAt(data.projects, repaired.projects);
  const progressPhotos = mergeProgressPhotosById(data.progressPhotos, repaired.progressPhotos);
  const yarnStash = mergeYarnStashById(data.yarnStash, repaired.yarnStash);
  const activeProjectId = resolveActiveProjectId(data.activeProjectId, repaired.activeProjectId, projects);
  const merged: CrochetData = {
    ...data,
    patterns,
    projects,
    activeProjectId,
    yarnStash,
    progressPhotos,
    account: repaired.account ?? data.account,
    likedPatternIds,
    collectedPatternIds,
    collectionFolders,
    patternComments: repaired.patternComments,
    followedCreators: repaired.followedCreators,
    tapHistory: data.tapHistory,
  };
  const reconciled = applyReconcileTimers(merged, now);
  return reconciled ?? merged;
}

export function applyAddStashItem(data: CrochetData, id: string, input: NewYarnInput): CrochetData | null {
  const item = buildStashItem(id, input);
  if (!item) return null;
  return { ...data, yarnStash: [...data.yarnStash, item] };
}

export function applyUpdateStashItem(
  data: CrochetData,
  stashItemId: string,
  patch: YarnStashPatch,
  now: number,
): CrochetData | null {
  const current = data.yarnStash.find((item) => item.id === stashItemId);
  if (!current) return null;
  const nextItem = applyStashPatch(current, patch);
  if (!nextItem) return null;
  const yarnStash = data.yarnStash.map((item) => (item.id === nextItem.id ? nextItem : item));
  return { ...data, yarnStash };
}

export function applyRemoveStashItem(data: CrochetData, stashItemId: string, _now: number): CrochetData | null {
  if (!data.yarnStash.some((item) => item.id === stashItemId)) return null;
  return {
    ...data,
    yarnStash: data.yarnStash.filter((item) => item.id !== stashItemId),
  };
}

export function applySetRowNote(data: CrochetData, note: string, now: number): CrochetData | null {
  const project = activeProject(data);
  if (!project) return null;
  const rowNote = sanitizeRowNote(note);
  if (rowNote === project.rowNote) return null;
  return replaceProject(data, { ...project, rowNote, updatedAt: now });
}

export function applyAddProjectYarnColor(
  data: CrochetData,
  id: string,
  input: NewProjectYarnColorInput,
  now: number,
): CrochetData | null {
  const project = activeProject(data);
  if (!project || project.yarnColors.length >= MAX_PROJECT_YARN_COLORS) return null;
  const color = buildProjectYarnColor(id, input);
  if (!color) return null;
  if (project.yarnColors.some((item) => item.id === color.id)) return null;
  return replaceProject(data, {
    ...project,
    yarnColors: [...project.yarnColors, color],
    updatedAt: now,
  });
}

export function applyUpdateProjectYarnColor(
  data: CrochetData,
  colorId: string,
  patch: ProjectYarnColorPatch,
  now: number,
): CrochetData | null {
  const project = activeProject(data);
  if (!project) return null;
  const index = project.yarnColors.findIndex((item) => item.id === colorId);
  if (index < 0) return null;
  const next = applyProjectYarnColorPatch(project.yarnColors[index], patch);
  if (!next) return null;
  const yarnColors = [...project.yarnColors];
  yarnColors[index] = next;
  return replaceProject(data, { ...project, yarnColors, updatedAt: now });
}

export function applyRemoveProjectYarnColor(data: CrochetData, colorId: string, now: number): CrochetData | null {
  const project = activeProject(data);
  if (!project) return null;
  if (!project.yarnColors.some((item) => item.id === colorId)) return null;
  return replaceProject(data, {
    ...project,
    yarnColors: project.yarnColors.filter((item) => item.id !== colorId),
    updatedAt: now,
  });
}

export function applyAddCheckpoint(
  data: CrochetData,
  id: string,
  input: NewVideoCheckpointInput,
  now: number,
): CrochetData | null {
  const project = activeProject(data);
  if (!project || project.checkpoints.length >= MAX_VIDEO_CHECKPOINTS) return null;
  const checkpoint = buildVideoCheckpoint(id, input);
  if (!checkpoint) return null;
  if (project.checkpoints.some((item) => item.id === checkpoint.id)) return null;
  const checkpoints = sortCheckpoints([...project.checkpoints, checkpoint]);
  return replaceProject(data, { ...project, checkpoints, updatedAt: now });
}

export function applyRemoveCheckpoint(data: CrochetData, checkpointId: string, now: number): CrochetData | null {
  const project = activeProject(data);
  if (!project) return null;
  if (!project.checkpoints.some((item) => item.id === checkpointId)) return null;
  return replaceProject(data, {
    ...project,
    checkpoints: project.checkpoints.filter((item) => item.id !== checkpointId),
    updatedAt: now,
  });
}

export function buildPattern(id: string, input: NewPatternInput): CrochetPattern | null {
  if (!isSafeId(id)) return null;
  const title = sanitizeText(input.title, 120);
  if (!title) return null;
  const detected = detectPatternVideo({
    url: input.videoUrl?.trim() || input.youtubeUrl,
    text: `${input.youtubeUrl}\n${input.videoUrl ?? ''}`,
  });
  if (!detected) return null;
  const tags = (input.tags ?? [])
    .map((tag) => sanitizeText(tag, 24))
    .filter((tag): tag is string => Boolean(tag))
    .slice(0, 8);
  const totalRows = clampInt(input.totalRows ?? 10, 1, MAX_COUNT);
  const bookmarks = sanitizeVideoBookmarks(input.bookmarks);
  const summaryRaw = typeof input.summary === 'string' ? sanitizeText(input.summary, 200) : null;
  const steps = sanitizePatternSteps(input.steps);
  const source = isPatternVideoSource(input.source) ? input.source : detected.videoId ? undefined : detected.source;
  const includeVideoUrl = Boolean(input.videoUrl) || !detected.videoId;
  return {
    id,
    title,
    creator: sanitizeText(input.creator ?? '', 80) || 'Unknown',
    youtubeUrl: detected.youtubeUrl,
    videoId: detected.videoId,
    thumbnailUrl: detected.thumbnailUrl,
    difficulty: input.difficulty && DIFFICULTIES.has(input.difficulty) ? input.difficulty : 'easy',
    yarnWeight: isYarnWeight(input.yarnWeight) ? input.yarnWeight : 'worsted',
    hookSize: sanitizeHook(input.hookSize ?? ''),
    totalRows,
    stitchesPerRow: clampInt(input.stitchesPerRow ?? 10, 1, MAX_COUNT),
    tags,
    ...(summaryRaw ? { summary: summaryRaw } : {}),
    bookmarks,
    ...(includeVideoUrl ? { videoUrl: detected.videoUrl } : {}),
    ...(source ? { source } : {}),
    ...(steps.length > 0 ? { steps } : {}),
  };
}

/** Turns a pending community submission into a catalog pattern, or null when it is incomplete. */
export function patternFromCommunitySubmission(
  id: string,
  input: CommunityCatalogSubmission,
): CrochetPattern | null {
  if (
    input.status &&
    input.status !== 'pending' &&
    input.status !== 'approved' &&
    input.status !== 'published'
  ) {
    return null;
  }
  if (!isPatternVideoSource(input.source) || !isYarnWeight(input.yarnWeight)) return null;
  if (!Array.isArray(input.steps) || input.steps.length === 0) return null;
  const pattern = buildPattern(id, {
    title: input.title,
    creator: 'Community',
    youtubeUrl: input.videoUrl,
    videoUrl: input.videoUrl,
    source: input.source,
    yarnWeight: input.yarnWeight,
    hookSize: input.hookSize,
    steps: [...input.steps],
    tags: ['community'],
    totalRows: Math.max(1, Math.min(input.steps.length, MAX_COUNT)),
  });
  if (!pattern?.steps || pattern.steps.length === 0) return null;
  if (!reviewCrochetPattern({ title: pattern.title, steps: pattern.steps }).ok) return null;
  return pattern;
}

/** Appends community patterns that are not already in the catalog by video or title. */
export function mergeCommunityPatterns(existing: CrochetPattern[], incoming: CrochetPattern[]): CrochetPattern[] {
  const next = [...existing];
  const seen = new Set(existing.map((pattern) => catalogDedupeKey(pattern)));
  const titles = new Set(existing.map((pattern) => pattern.title.trim().toLowerCase()));
  for (const pattern of incoming) {
    const key = catalogDedupeKey(pattern);
    const title = pattern.title.trim().toLowerCase();
    if (seen.has(key) || titles.has(title)) continue;
    seen.add(key);
    titles.add(title);
    next.push(pattern);
  }
  return next.length === existing.length ? existing : next;
}

export function catalogDedupeKey(pattern: Pick<CrochetPattern, 'videoId' | 'videoUrl' | 'title'>): string {
  if (pattern.videoId) return `yt:${pattern.videoId}`;
  if (pattern.videoUrl) {
    const normalized = normalizeHttpUrl(pattern.videoUrl);
    if (normalized) return `url:${normalized}`;
  }
  return `title:${pattern.title.trim().toLowerCase()}`;
}

export function findExistingPatternId(patterns: CrochetPattern[], input: NewPatternInput): string | null {
  const detected = detectPatternVideo({
    url: input.videoUrl?.trim() || input.youtubeUrl,
    text: `${input.youtubeUrl}\n${input.videoUrl ?? ''}`,
  });
  if (!detected) return null;
  const existing = patterns.find((pattern) => {
    if (detected.videoId && pattern.videoId === detected.videoId) return true;
    if (detected.videoUrl && pattern.videoUrl === detected.videoUrl) return true;
    return false;
  });
  return existing?.id ?? null;
}

export function buildStashItem(id: string, input: NewYarnInput): YarnStashItem | null {
  if (!isSafeId(id) || !isYarnWeight(input.yarnWeight)) return null;
  const hexColor = normalizeHex(input.hexColor);
  const brand = sanitizeText(input.brand, 60);
  const colorName = sanitizeText(input.colorName, 60);
  if (!hexColor || !brand || !colorName) return null;
  return {
    id,
    hexColor,
    brand,
    colorName,
    yarnWeight: input.yarnWeight,
    hookSize: sanitizeHook(input.hookSize ?? ''),
    skeinCount: clampInt(input.skeinCount ?? 1, 0, MAX_SKEINS),
  };
}

export function buildProjectYarnColor(id: string, input: NewProjectYarnColorInput): ProjectYarnColor | null {
  if (!isSafeId(id)) return null;
  const hexColor = normalizeHex(input.hexColor);
  const label = sanitizeText(input.label, 40);
  if (!hexColor || !label) return null;
  return { id, hexColor, label };
}

export function buildVideoCheckpoint(id: string, input: NewVideoCheckpointInput): VideoCheckpoint | null {
  if (!isSafeId(id)) return null;
  const label = sanitizeText(input.label, MAX_CHECKPOINT_LABEL_CHARS);
  if (!label) return null;
  const timestampSeconds = clampInt(input.timestampSeconds, 0, 99_999);
  return { id, label, timestampSeconds };
}

export function applyAddProgressPhoto(
  data: CrochetData,
  id: string,
  input: NewProgressPhotoInput,
  now = Date.now(),
): CrochetData | null {
  if (!data.projects.some((project) => project.id === input.projectId)) return null;
  const photo = buildProgressPhoto(id, input, now);
  if (!photo) return null;
  const others = data.progressPhotos.filter((item) => item.projectId !== photo.projectId);
  const mine = sortPhotos([...data.progressPhotos.filter((item) => item.projectId === photo.projectId), photo]).slice(
    -MAX_PROGRESS_PHOTOS,
  );
  return { ...data, progressPhotos: sortPhotos([...others, ...mine]) };
}

export function applyRemoveProgressPhoto(data: CrochetData, photoId: string): CrochetData | null {
  if (!data.progressPhotos.some((photo) => photo.id === photoId)) return null;
  return { ...data, progressPhotos: data.progressPhotos.filter((photo) => photo.id !== photoId) };
}

/** ISO-8601 form of a progress still's epoch timestamp. */
export function progressPhotoCreatedAtIso(createdAt: number): string {
  const ms = typeof createdAt === 'number' && Number.isFinite(createdAt) ? createdAt : 0;
  return new Date(ms).toISOString();
}

export function buildProgressPhoto(id: string, input: NewProgressPhotoInput, now = Date.now()): ProgressPhoto | null {
  if (!isSafeId(id) || !isSafeId(input.projectId) || !isProgressPhotoUri(input.uri)) return null;
  const projectName = sanitizeText(input.projectName, 80);
  if (!projectName) return null;
  const totalRows = clampInt(input.totalRows, 1, MAX_COUNT);
  const row = clampInt(input.row, 1, totalRows);
  const reflection = reflectionFields(input.caption, input.note, true);
  const milestoneTag = sanitizeMilestone(input.milestoneTag);
  const stitchCount = optionalCount(input.stitchCount, 0, MAX_COUNT);
  return {
    id,
    projectId: input.projectId,
    uri: input.uri,
    projectName,
    row,
    totalRows,
    percent: clampPercent(input.percent),
    elapsedSeconds: bankSeconds(input.elapsedSeconds),
    hookSize: sanitizeHook(input.hookSize),
    createdAt: photoTimestamp(input.createdAt, now),
    rowNumber: clampInt(input.rowNumber ?? row, 1, totalRows),
    sessionDurationSeconds: bankSeconds(input.sessionDurationSeconds ?? input.elapsedSeconds),
    ...reflection,
    ...(stitchCount !== undefined ? { stitchCount } : {}),
    ...(milestoneTag ? { milestoneTag } : {}),
  };
}

/**
 * Heal a blob read back from disk. `null` means it isn't our shape and the
 * caller should keep the seed instead of crashing on a partial object.
 * An empty-but-valid stash (the user deleted everything) is preserved.
 */
export function repairPersisted(input: unknown, now = Date.now()): CrochetPersistedSlice | null {
  if (!isRecord(input)) return null;
  const hasPatterns = 'patterns' in input;
  const hasProjects = 'projects' in input;
  const hasStash = 'yarnStash' in input;
  if (!hasPatterns && !hasProjects && !hasStash) return null;
  if (hasPatterns && !Array.isArray(input.patterns)) return null;
  if (hasProjects && !Array.isArray(input.projects)) return null;
  if (hasStash && !Array.isArray(input.yarnStash)) return null;

  const patterns = dedupeById(
    readArray(input.patterns)
      .map((item) => repairPattern(item))
      .filter((item): item is CrochetPattern => item != null),
  );
  const yarnStash = dedupeById(
    readArray(input.yarnStash)
      .map((item) => repairStashItem(item))
      .filter((item): item is YarnStashItem => item != null),
  );
  const projects = dedupeById(
    readArray(input.projects)
      .map((item) => repairProject(item, patterns, now))
      .filter((item): item is CrochetProject => item != null),
  );

  let activeProjectId: string | null = null;
  if (typeof input.activeProjectId === 'string' && projects.some((project) => project.id === input.activeProjectId)) {
    activeProjectId = input.activeProjectId;
  } else if (typeof input.activeProjectId === 'string') {
    activeProjectId = projects.find((project) => project.status === 'in-progress')?.id ?? projects[0]?.id ?? null;
  }

  const progressPhotos = sortPhotos(
    dedupeById(
      readArray(input.progressPhotos)
        .map((item) => repairProgressPhoto(item))
        .filter((item): item is ProgressPhoto => item != null),
    ),
  ).slice(-MAX_PROGRESS_PHOTOS * 8);

  const account = repairAccount(input.account);
  const likedPatternIds = repairLikedPatternIds(input.likedPatternIds, patterns);
  let collectionFolders = repairIdeaFolders(
    'collectionFolders' in input ? input.collectionFolders : input.ideaFolders,
    patterns,
  );
  collectionFolders = applyEnsureDefaultCollectionFolder(
    {
      patterns,
      projects,
      activeProjectId,
      yarnStash,
      progressPhotos,
      account,
      likedPatternIds,
      collectedPatternIds: [],
      collectionFolders,
      patternComments: [],
      followedCreators: [],
      tapHistory: {},
    },
    now,
  ).collectionFolders;
  let collectedPatternIds = repairCollectedPatternIds(input.collectedPatternIds, patterns);
  if (collectedPatternIds.length === 0 && collectionFolders.length > 0) {
    const fromFolders = collectionFolders.flatMap((folder) => folder.patternIds);
    collectedPatternIds = repairCollectedPatternIds(fromFolders, patterns);
  }
  const defaultFolder = collectionFolders.find((folder) => folder.isDefault);
  if (defaultFolder) {
    const orphans = collectedPatternIds.filter(
      (id) => !collectionFolders.some((folder) => folder.patternIds.includes(id)),
    );
    if (orphans.length > 0) {
      const patternIds = [...new Set([...defaultFolder.patternIds, ...orphans])];
      collectionFolders = collectionFolders.map((folder) =>
        folder.id === defaultFolder.id ? { ...folder, patternIds, updatedAt: now } : folder,
      );
    }
  }

  const patternComments = repairPatternComments(input.patternComments, patterns);
  const followedCreators = repairFollowedCreators(input.followedCreators);

  return {
    patterns,
    projects,
    activeProjectId,
    yarnStash,
    progressPhotos,
    account,
    likedPatternIds,
    collectedPatternIds,
    collectionFolders,
    patternComments,
    followedCreators,
  };
}

/**
 * Keeps saved patterns and appends bundled seed catalog entries that are not
 * already present (matched by YouTube video id). Scraper updates in seed.ts
 * show up after reload without wiping projects or stash.
 */
export function mergeCatalogPatternsFromSeed(
  persisted: CrochetPattern[],
  seedCatalog: CrochetPattern[],
): CrochetPattern[] {
  const seenVideoIds = new Set(
    persisted.map((pattern) => pattern.videoId).filter((id) => id.length > 0),
  );
  const additions: CrochetPattern[] = [];
  for (const pattern of seedCatalog) {
    if (!pattern.videoId || seenVideoIds.has(pattern.videoId)) continue;
    seenVideoIds.add(pattern.videoId);
    additions.push(pattern);
  }
  if (additions.length === 0) return persisted;
  return dedupeById([...persisted, ...additions]);
}

/** Pattern ids referenced by projects, likes, collections, or folders. */
export function collectReferencedPatternIds(data: CrochetPersistedSlice): Set<string> {
  const ids = new Set<string>();
  for (const project of data.projects) {
    if (project.patternId) ids.add(project.patternId);
  }
  for (const id of data.likedPatternIds) ids.add(id);
  for (const id of data.collectedPatternIds) ids.add(id);
  for (const folder of data.collectionFolders) {
    for (const id of folder.patternIds) ids.add(id);
  }
  return ids;
}

/**
 * Overlays remote catalog fields onto bundled patterns (same YouTube video id).
 * Remote JSON must not re-introduce patterns removed from the app bundle — only
 * refreshes metadata for videos still in seed/catalog.
 */
export function overlayRemoteCatalogOnBundled(
  bundledCatalog: CrochetPattern[],
  remoteCatalog: CrochetPattern[],
): CrochetPattern[] {
  const remoteByVideoId = new Map<string, CrochetPattern>();
  for (const pattern of remoteCatalog) {
    if (!pattern.videoId) continue;
    remoteByVideoId.set(pattern.videoId, pattern);
  }
  return bundledCatalog.map((pattern) => {
    if (!pattern.videoId) return pattern;
    return remoteByVideoId.get(pattern.videoId) ?? pattern;
  });
}

/**
 * When the scraper publishes `catalog/pattern-catalog.json`, that file is a full
 * export of seed — not a delta. Prefer it over the APK bundle so new patterns
 * land without reinstalling. Offline / failed fetch keeps the bundled catalog.
 */
export function resolveCanonicalPatternCatalog(
  bundledCatalog: CrochetPattern[],
  remoteCatalog: CrochetPattern[],
): CrochetPattern[] {
  if (remoteCatalog.length > 0) {
    return dedupeById([...remoteCatalog]);
  }
  return [...bundledCatalog];
}

/**
 * Published catalog = remote JSON when available, else bundled seed. Replaces stale
 * feed entries that linger in AsyncStorage, Firestore, or an old CDN snapshot.
 */
export function reconcilePatternCatalog(
  persisted: CrochetPattern[],
  bundledCatalog: CrochetPattern[],
  remoteCatalog: CrochetPattern[] = [],
  retainPatternIds: ReadonlySet<string> = new Set(),
): CrochetPattern[] {
  let canonical = resolveCanonicalPatternCatalog(bundledCatalog, remoteCatalog);
  canonical = canonical.filter((pattern) =>
    isEnglishFeedPattern({
      title: pattern.title,
      creator: pattern.creator,
    }),
  );
  const canonicalKeys = new Set(canonical.map((pattern) => catalogDedupeKey(pattern)));

  const orphanKeep = persisted.filter((pattern) => {
    if (canonicalKeys.has(catalogDedupeKey(pattern))) return false;
    if (pattern.source) return true;
    return pattern.videoId.length > 0 && retainPatternIds.has(pattern.id);
  });

  return dedupeById([...canonical, ...orphanKeep]);
}

function repairProgressPhoto(input: unknown): ProgressPhoto | null {
  if (!isRecord(input) || !isSafeId(input.id) || !isSafeId(input.projectId)) return null;
  if (typeof input.uri !== 'string' || !isProgressPhotoUri(input.uri)) return null;
  const projectName = typeof input.projectName === 'string' ? sanitizeText(input.projectName, 80) : null;
  if (!projectName) return null;
  const totalRows = clampInt(numberOr(input.totalRows, 1), 1, MAX_COUNT);
  const rowSource = typeof input.row === 'number' ? input.row : typeof input.rowNumber === 'number' ? input.rowNumber : 1;
  const row = clampInt(rowSource, 1, totalRows);
  const reflection = reflectionFields(
    typeof input.caption === 'string' ? input.caption : undefined,
    typeof input.note === 'string' ? input.note : undefined,
    false,
  );
  const milestoneTag = sanitizeMilestone(input.milestoneTag);
  const stitchCount = optionalCount(input.stitchCount, 0, MAX_COUNT);
  const elapsedSeconds = bankSeconds(
    numberOr(input.elapsedSeconds, numberOr(input.sessionDurationSeconds, 0)),
  );
  const sessionDurationSeconds =
    typeof input.sessionDurationSeconds === 'number' ? bankSeconds(input.sessionDurationSeconds) : undefined;
  const rowNumber = typeof input.rowNumber === 'number' ? clampInt(input.rowNumber, 1, totalRows) : undefined;
  return {
    id: input.id,
    projectId: input.projectId,
    uri: input.uri,
    projectName,
    row,
    totalRows,
    percent: clampPercent(numberOr(input.percent, 0)),
    elapsedSeconds,
    hookSize: typeof input.hookSize === 'string' ? sanitizeHook(input.hookSize) : '',
    createdAt: photoTimestamp(input.createdAt, 1),
    ...(rowNumber !== undefined ? { rowNumber } : {}),
    ...(sessionDurationSeconds !== undefined ? { sessionDurationSeconds } : {}),
    ...reflection,
    ...(stitchCount !== undefined ? { stitchCount } : {}),
    ...(milestoneTag ? { milestoneTag } : {}),
  };
}

function sortPhotos(photos: ProgressPhoto[]): ProgressPhoto[] {
  return [...photos].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}

function isProgressPhotoUri(uri: string): boolean {
  if (uri.length === 0 || uri.length > MAX_PHOTO_URI) return false;
  return (
    uri.startsWith('data:image/') ||
    uri.startsWith('file://') ||
    uri.startsWith('content://') ||
    uri.startsWith('ph://') ||
    uri.startsWith('assets-library://')
  );
}

function isCommentPhotoUri(uri: string): boolean {
  if (uri.length === 0 || uri.length > 2048) return false;
  if (isProgressPhotoUri(uri)) return true;
  return uri.startsWith('https://') || uri.startsWith('http://');
}

function commitCounter(
  data: CrochetData,
  project: CrochetProject,
  now: number,
  patch: Partial<Pick<CrochetProject, 'currentStitch' | 'currentRow'>>,
): CrochetData {
  const next: CrochetProject = { ...project, ...patch, updatedAt: now };
  const history = data.tapHistory[project.id] ?? EMPTY_HISTORY;
  const start = history.length >= MAX_TAP_HISTORY ? history.length - MAX_TAP_HISTORY + 1 : 0;
  const nextHistory = [
    ...history.slice(start),
    { currentStitch: project.currentStitch, currentRow: project.currentRow },
  ];
  return {
    ...data,
    projects: data.projects.map((item) => (item.id === project.id ? next : item)),
    tapHistory: { ...data.tapHistory, [project.id]: nextHistory },
  };
}

function replaceProject(data: CrochetData, project: CrochetProject): CrochetData {
  return {
    ...data,
    projects: data.projects.map((item) => (item.id === project.id ? project : item)),
  };
}

function applyStashPatch(item: YarnStashItem, patch: YarnStashPatch): YarnStashItem | null {
  let next = item;
  if (patch.hexColor !== undefined) {
    const hexColor = normalizeHex(patch.hexColor);
    if (hexColor && hexColor !== next.hexColor) next = { ...next, hexColor };
  }
  if (patch.brand !== undefined) {
    const brand = sanitizeText(patch.brand, 60);
    if (brand && brand !== next.brand) next = { ...next, brand };
  }
  if (patch.colorName !== undefined) {
    const colorName = sanitizeText(patch.colorName, 60);
    if (colorName && colorName !== next.colorName) next = { ...next, colorName };
  }
  if (patch.yarnWeight !== undefined && isYarnWeight(patch.yarnWeight) && patch.yarnWeight !== next.yarnWeight) {
    next = { ...next, yarnWeight: patch.yarnWeight };
  }
  if (patch.hookSize !== undefined) {
    const hookSize = sanitizeHook(patch.hookSize);
    if (hookSize !== next.hookSize) next = { ...next, hookSize };
  }
  if (patch.skeinCount !== undefined && Number.isFinite(patch.skeinCount)) {
    const skeinCount = clampInt(patch.skeinCount, 0, MAX_SKEINS);
    if (skeinCount !== next.skeinCount) next = { ...next, skeinCount };
  }
  return next === item ? null : next;
}

function applyProjectYarnColorPatch(color: ProjectYarnColor, patch: ProjectYarnColorPatch): ProjectYarnColor | null {
  let next = color;
  if (patch.hexColor !== undefined) {
    const hexColor = normalizeHex(patch.hexColor);
    if (hexColor && hexColor !== next.hexColor) next = { ...next, hexColor };
  }
  if (patch.label !== undefined) {
    const label = sanitizeText(patch.label, 40);
    if (label && label !== next.label) next = { ...next, label };
  }
  return next === color ? null : next;
}

function sortCheckpoints(checkpoints: VideoCheckpoint[]): VideoCheckpoint[] {
  return [...checkpoints].sort((a, b) => a.timestampSeconds - b.timestampSeconds || a.id.localeCompare(b.id));
}

/** Validates pattern objects from `catalog/pattern-catalog.json` (remote scraper feed). */
export function parseCatalogPatterns(input: unknown): CrochetPattern[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => repairPattern(item))
    .filter((item): item is CrochetPattern => item != null);
}

function repairPattern(input: unknown): CrochetPattern | null {
  if (!isRecord(input) || !isSafeId(input.id)) return null;
  const title = typeof input.title === 'string' ? sanitizeText(input.title, 120) : null;
  const videoId = typeof input.videoId === 'string' ? input.videoId : '';
  const parsed = parseYouTubeUrl(typeof input.youtubeUrl === 'string' ? input.youtubeUrl : videoId);
  const pageUrl = typeof input.videoUrl === 'string' ? normalizeHttpUrl(input.videoUrl) : null;
  if (!title || (!parsed && !pageUrl)) return null;
  const tags = Array.isArray(input.tags)
    ? input.tags.map((tag) => (typeof tag === 'string' ? sanitizeText(tag, 24) : null)).filter(isPresent).slice(0, 8)
    : [];
  const totalRows = clampInt(numberOr(input.totalRows, 10), 1, MAX_COUNT);
  const rawBookmarks = Array.isArray(input.bookmarks)
    ? input.bookmarks
        .map((item) => {
          if (!isRecord(item) || typeof item.label !== 'string') return null;
          const label = sanitizeText(item.label, MAX_CHECKPOINT_LABEL_CHARS);
          if (!label) return null;
          const seconds = clampInt(numberOr(item.seconds, 0), 0, 99_999);
          const rowHint =
            item.rowHint != null ? clampInt(numberOr(item.rowHint, 0), 1, MAX_COUNT) : undefined;
          const id = typeof item.id === 'string' && isSafeId(item.id) ? item.id : `bm-${seconds}`;
          return { id, label, seconds, ...(rowHint != null ? { rowHint } : {}) };
        })
        .filter(isPresent)
    : undefined;
  let bookmarks = sanitizeVideoBookmarks(rawBookmarks);
  if (isEstimatedBookmarkSet(bookmarks)) bookmarks = [];
  const summary =
    typeof input.summary === 'string' ? sanitizeText(input.summary, 200) : null;
  const steps = sanitizePatternSteps(
    Array.isArray(input.steps) ? input.steps.filter((step): step is string => typeof step === 'string') : undefined,
  );
  const source = isPatternVideoSource(input.source) ? input.source : undefined;
  const storedThumb =
    typeof input.thumbnailUrl === 'string' && input.thumbnailUrl.startsWith('https://')
      ? input.thumbnailUrl.slice(0, 500)
      : '';
  return {
    id: input.id,
    title,
    creator: (typeof input.creator === 'string' && sanitizeText(input.creator, 80)) || 'Unknown',
    youtubeUrl: parsed ? parsed.canonicalUrl : '',
    videoId: parsed ? parsed.videoId : '',
    thumbnailUrl: parsed ? parsed.thumbnailUrl : storedThumb,
    difficulty: typeof input.difficulty === 'string' && DIFFICULTIES.has(input.difficulty) ? (input.difficulty as PatternDifficulty) : 'easy',
    yarnWeight: isYarnWeight(input.yarnWeight) ? input.yarnWeight : 'worsted',
    hookSize: typeof input.hookSize === 'string' ? sanitizeHook(input.hookSize) : '',
    totalRows,
    stitchesPerRow: clampInt(numberOr(input.stitchesPerRow, 10), 1, MAX_COUNT),
    tags,
    ...(summary ? { summary } : {}),
    bookmarks,
    ...(pageUrl ? { videoUrl: pageUrl } : {}),
    ...(source ? { source } : {}),
    ...(steps.length > 0 ? { steps } : {}),
  };
}

function repairStashItem(input: unknown): YarnStashItem | null {
  if (!isRecord(input) || !isSafeId(input.id) || !isYarnWeight(input.yarnWeight)) return null;
  const hexColor = typeof input.hexColor === 'string' ? normalizeHex(input.hexColor) : null;
  const brand = typeof input.brand === 'string' ? sanitizeText(input.brand, 60) : null;
  const colorName = typeof input.colorName === 'string' ? sanitizeText(input.colorName, 60) : null;
  if (!hexColor || !brand || !colorName) return null;
  return {
    id: input.id,
    hexColor,
    brand,
    colorName,
    yarnWeight: input.yarnWeight,
    hookSize: typeof input.hookSize === 'string' ? sanitizeHook(input.hookSize) : '',
    skeinCount: clampInt(numberOr(input.skeinCount, 1), 0, MAX_SKEINS),
  };
}

function repairProject(input: unknown, patterns: CrochetPattern[], now: number): CrochetProject | null {
  if (!isRecord(input) || !isSafeId(input.id)) return null;
  const name = typeof input.name === 'string' ? sanitizeName(input.name) : null;
  if (!name) return null;
  const stitchesPerRow = clampInt(numberOr(input.stitchesPerRow, 1), 1, MAX_COUNT);
  // A row count past the saved goal means the goal was truncated, not that
  // progress should be thrown away. Lift the goal up to the row we're on.
  const currentRow = clampInt(numberOr(input.currentRow, 1), 1, MAX_COUNT);
  const totalRows = Math.max(clampInt(numberOr(input.totalRows, 1), 1, MAX_COUNT), currentRow);
  const patternIds = new Set(patterns.map((pattern) => pattern.id));
  let patternId = typeof input.patternId === 'string' && patternIds.has(input.patternId) ? input.patternId : null;
  // The first sample project pointed at a tutorial that is no longer in the library.
  if (patternId == null && input.patternId === 'pattern-little-fawn') {
    const linked = patterns.find((item) => item.id === 'pattern-super-easy-crochet-pattern-for-beginners-lovely-');
    if (linked) patternId = linked.id;
  }
  const pattern = patternId ? (patterns.find((item) => item.id === patternId) ?? null) : null;
  // The untouched first-launch sample is the Active dashboard's 4.0 mm / #4 make.
  // Anything the user has already counted is left alone.
  const legacySample =
    input.id === 'project-bambi' &&
    input.patternId === 'pattern-little-fawn' &&
    !('hookSize' in input) &&
    numberOr(input.currentStitch, -1) === 17 &&
    numberOr(input.stitchesPerRow, -1) === 36 &&
    numberOr(input.currentRow, -1) === 28 &&
    numberOr(input.totalRows, -1) === 40;
  const resolvedStitchesPerRow = legacySample ? 60 : stitchesPerRow;
  const resolvedStitch = legacySample ? 14 : clampInt(numberOr(input.currentStitch, 0), 0, resolvedStitchesPerRow);
  // Projects saved before hook and yarn lived on the make inherit them from the pattern.
  const hookSize = legacySample
    ? '4.0 mm'
    : typeof input.hookSize === 'string'
      ? sanitizeHook(input.hookSize)
      : (pattern?.hookSize ?? '');
  const yarnWeight = legacySample ? 'worsted' : isYarnWeight(input.yarnWeight) ? input.yarnWeight : (pattern?.yarnWeight ?? 'worsted');
  const draft: CrochetProject = {
    id: input.id,
    name,
    patternId,
    status: input.status === 'finished' ? 'finished' : 'in-progress',
    currentStitch: resolvedStitch,
    stitchesPerRow: resolvedStitchesPerRow,
    currentRow,
    totalRows,
    hookSize,
    yarnWeight,
    timerStartedAt: typeof input.timerStartedAt === 'number' && Number.isFinite(input.timerStartedAt) ? input.timerStartedAt : null,
    accumulatedSeconds: bankSeconds(numberOr(input.accumulatedSeconds, 0)),
    yarnColors: repairYarnColors(input),
    rowNote: typeof input.rowNote === 'string' ? sanitizeRowNote(input.rowNote) : '',
    checkpoints: repairCheckpoints(input.checkpoints),
    createdAt: finiteTimestamp(input.createdAt, now),
    updatedAt: finiteTimestamp(input.updatedAt, now),
  };
  return reconcileProjectClock(draft, now);
}

function repairYarnColors(input: Record<string, unknown>): ProjectYarnColor[] {
  if (Array.isArray(input.yarnColors)) {
    const colors = readArray(input.yarnColors)
      .map((item) => repairProjectYarnColor(item))
      .filter((item): item is ProjectYarnColor => item != null)
      .slice(0, MAX_PROJECT_YARN_COLORS);
    if (colors.length > 0) return dedupeById(colors);
  }
  return migrateLegacySlots(input.slots).slice(0, MAX_PROJECT_YARN_COLORS);
}

function repairProjectYarnColor(input: unknown): ProjectYarnColor | null {
  if (!isRecord(input) || !isSafeId(input.id)) return null;
  const hexColor = typeof input.hexColor === 'string' ? normalizeHex(input.hexColor) : null;
  const label = typeof input.label === 'string' ? sanitizeText(input.label, 40) : null;
  if (!hexColor || !label) return null;
  return { id: input.id, hexColor, label };
}

/** Older saves used AMS slots; lift non-empty swatches into the project palette. */
function migrateLegacySlots(input: unknown): ProjectYarnColor[] {
  const raw = Array.isArray(input) ? input : [];
  const result: ProjectYarnColor[] = [];
  for (const entry of raw) {
    if (!isRecord(entry) || result.length >= MAX_PROJECT_YARN_COLORS) break;
    const hexColor = typeof entry.hexColor === 'string' ? normalizeHex(entry.hexColor) : null;
    const colorName = typeof entry.colorName === 'string' ? sanitizeText(entry.colorName, 40) : null;
    const brand = typeof entry.brand === 'string' ? sanitizeText(entry.brand, 40) : null;
    const label = colorName ?? brand;
    if (!hexColor || !label) continue;
    const id =
      typeof entry.id === 'string' && isSafeId(entry.id) ? `color-${entry.id}` : createId('color');
    result.push({ id, hexColor, label });
  }
  return dedupeById(result);
}

function repairCheckpoints(input: unknown): VideoCheckpoint[] {
  if (!Array.isArray(input)) return [];
  const checkpoints = readArray(input)
    .map((item) => repairCheckpoint(item))
    .filter((item): item is VideoCheckpoint => item != null);
  return sortCheckpoints(dedupeById(checkpoints)).slice(0, MAX_VIDEO_CHECKPOINTS);
}

function repairCheckpoint(input: unknown): VideoCheckpoint | null {
  if (!isRecord(input) || !isSafeId(input.id)) return null;
  const label = typeof input.label === 'string' ? sanitizeText(input.label, MAX_CHECKPOINT_LABEL_CHARS) : null;
  if (!label) return null;
  return {
    id: input.id,
    label,
    timestampSeconds: clampInt(numberOr(input.timestampSeconds, 0), 0, 99_999),
  };
}

function sanitizeRowNote(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, MAX_ROW_NOTE_CHARS);
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
  }
  return result;
}

function sanitizeName(value: string): string | null {
  return sanitizeText(value, 80);
}

function sanitizeText(value: string, max: number): string | null {
  const text = value.replace(/\s+/g, ' ').trim().slice(0, max);
  return text.length > 0 ? text : null;
}

function sanitizeOptionalCaption(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return sanitizeText(value, 120) ?? undefined;
}

function sanitizeHook(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 32);
}

function sanitizePatternSteps(steps: readonly string[] | undefined): string[] {
  if (!steps) return [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const step of steps) {
    const clean = cleanPatternText(step, 180);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(clean);
    if (result.length >= 16) break;
  }
  return result;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function finiteTimestamp(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

/** Epoch ms from a number or an ISO string. Falls back when the value is empty or invalid. */
function photoTimestamp(value: unknown, fallback: number): number {
  const numeric = finiteTimestamp(value, 0);
  if (numeric > 0) return numeric;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return fallback;
}

function optionalCount(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return clampInt(value, min, max);
}

function sanitizeMilestone(value: unknown): MilestoneTag | undefined {
  if (typeof value !== 'string') return undefined;
  return (MILESTONE_TAGS as readonly string[]).includes(value) ? (value as MilestoneTag) : undefined;
}

/**
 * Keep caption and note independent when both were written. New stills mirror a
 * single reflection into both fields; repair leaves a missing alias absent so
 * older photos are not rewritten.
 */
function reflectionFields(
  caption: string | undefined,
  note: string | undefined,
  mirror: boolean,
): { caption?: string; note?: string } {
  const cleanCaption = sanitizeOptionalCaption(caption);
  const cleanNote = sanitizeOptionalCaption(note);
  const captionOut = cleanCaption ?? (mirror ? cleanNote : undefined);
  const noteOut = cleanNote ?? (mirror ? cleanCaption : undefined);
  return {
    ...(captionOut ? { caption: captionOut } : {}),
    ...(noteOut ? { note: noteOut } : {}),
  };
}

function isSafeId(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return (
    trimmed.length > 0 &&
    trimmed.length <= 80 &&
    trimmed !== '__proto__' &&
    trimmed !== 'constructor' &&
    trimmed !== 'prototype'
  );
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value != null;
}

function accountsEqual(a: UserAccount, b: UserAccount): boolean {
  return (
    a.uid === b.uid &&
    a.email === b.email &&
    a.displayName === b.displayName &&
    a.username === b.username &&
    a.bio === b.bio &&
    a.avatarColor === b.avatarColor &&
    a.updatedAt === b.updatedAt &&
    a.membershipTier === b.membershipTier &&
    a.dailyUploadCount === b.dailyUploadCount &&
    a.lastUploadDate === b.lastUploadDate
  );
}

function sanitizeUsername(value: string): string | null {
  const trimmed = value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, MAX_USERNAME_CHARS);
  return trimmed.length >= 2 ? trimmed : null;
}

function sanitizeBio(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, MAX_BIO_CHARS);
}

function sanitizeFolderDescription(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, MAX_FOLDER_DESC_CHARS);
}

function repairAccount(input: unknown): UserAccount | null {
  if (!isRecord(input) || typeof input.uid !== 'string' || !isSafeId(input.uid)) return null;
  const email = typeof input.email === 'string' ? sanitizeText(input.email, 120) : null;
  const displayName = typeof input.displayName === 'string' ? sanitizeText(input.displayName, 80) : null;
  const username = typeof input.username === 'string' ? sanitizeUsername(input.username) : null;
  if (!email || !displayName || !username) return null;
  const bio = typeof input.bio === 'string' ? sanitizeBio(input.bio) : '';
  const avatarColor =
    typeof input.avatarColor === 'string' ? (normalizeHex(input.avatarColor) ?? '#2F6B4F') : '#2F6B4F';
  const updatedAt = finiteTimestamp(input.updatedAt, Date.now());
  return { uid: input.uid, email, displayName, username, bio, avatarColor, updatedAt, ...readUploadQuota(input) };
}

/** UTC calendar day, so the client cap matches Firestore's `timestamp.year/month/day`. */
export function utcDayKey(now: number): string {
  if (!Number.isFinite(now)) return '';
  return new Date(now).toISOString().slice(0, 10);
}

function readQuotaTimestamp(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  if (!isRecord(value)) return null;
  if (typeof value.toMillis === 'function') {
    const millis = (value.toMillis as () => unknown)();
    if (typeof millis === 'number' && Number.isFinite(millis) && millis > 0) return millis;
  }
  const seconds = typeof value.seconds === 'number' ? value.seconds : typeof value._seconds === 'number' ? value._seconds : null;
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return null;
  const nanos = typeof value.nanoseconds === 'number' ? value.nanoseconds : 0;
  return seconds * 1000 + Math.floor(nanos / 1_000_000);
}

function hasQuotaSignal(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && ('membershipTier' in value || 'dailyUploadCount' in value || 'lastUploadDate' in value);
}

/** Missing or malformed quota fields become basic membership with a clear counter. */
export function readUploadQuota(input: unknown): UploadQuota {
  if (!isRecord(input)) return { ...DEFAULT_UPLOAD_QUOTA };
  const membershipTier: MembershipTier = input.membershipTier === 'premium' ? 'premium' : 'basic';
  const dailyUploadCount =
    typeof input.dailyUploadCount === 'number' &&
    Number.isInteger(input.dailyUploadCount) &&
    input.dailyUploadCount >= 0 &&
    input.dailyUploadCount <= 1000
      ? input.dailyUploadCount
      : 0;
  return {
    membershipTier,
    dailyUploadCount,
    lastUploadDate: readQuotaTimestamp(input.lastUploadDate),
  };
}

/**
 * Earlier sources supply the counter. Premium on any source wins the tier so a
 * membership flag is not dropped when the counter lives on a second document.
 */
export function resolveUploadQuota(sources: readonly unknown[]): UploadQuota {
  let resolved: UploadQuota = { ...DEFAULT_UPLOAD_QUOTA };
  let sawCounter = false;
  for (const source of sources) {
    if (!hasQuotaSignal(source)) continue;
    const parsed = readUploadQuota(source);
    if (!sawCounter) {
      resolved = parsed;
      sawCounter = true;
      continue;
    }
    if (parsed.membershipTier === 'premium') resolved = { ...resolved, membershipTier: 'premium' };
  }
  return resolved;
}

export function canUploadToday(account: UploadQuota | null, now: number): boolean {
  if (!account) return false;
  if (account.membershipTier === 'premium') return true;
  if (account.lastUploadDate == null) return true;
  if (utcDayKey(account.lastUploadDate) !== utcDayKey(now)) return true;
  return account.dailyUploadCount < DAILY_UPLOAD_LIMIT;
}

/** Next basic counter, the same premium quota when the cap does not apply, or null when blocked. */
export function nextBasicQuota(current: UploadQuota, now: number): UploadQuota | null {
  if (!canUploadToday(current, now)) return null;
  if (current.membershipTier === 'premium') return current;
  const sameDay = current.lastUploadDate != null && utcDayKey(current.lastUploadDate) === utcDayKey(now);
  return {
    membershipTier: 'basic',
    dailyUploadCount: sameDay ? current.dailyUploadCount + 1 : 1,
    lastUploadDate: now,
  };
}

export function decideUploadAccess(account: UserAccount | null, firebaseReady: boolean, now: number): UploadAccess {
  if (!account) return firebaseReady ? 'sign-in' : 'allow';
  return canUploadToday(account, now) ? 'allow' : 'limit';
}

export function applyRecordUpload(data: CrochetData, now: number): CrochetData | null {
  if (!data.account) return null;
  const next = nextBasicQuota(data.account, now);
  if (!next) return null;
  if (
    next.membershipTier === data.account.membershipTier &&
    next.dailyUploadCount === data.account.dailyUploadCount &&
    next.lastUploadDate === data.account.lastUploadDate
  ) {
    return null;
  }
  return { ...data, account: { ...data.account, ...next } };
}

export function applyUploadQuota(data: CrochetData, quota: UploadQuota): CrochetData | null {
  if (!data.account) return null;
  const account = { ...data.account, ...quota };
  if (accountsEqual(data.account, account)) return null;
  return { ...data, account };
}

function repairPatternComments(input: unknown, patterns: CrochetPattern[]): PatternComment[] {
  const patternIds = new Set(patterns.map((pattern) => pattern.id));
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const result: PatternComment[] = [];
  for (const entry of input) {
    const comment = repairPatternComment(entry, patternIds);
    if (!comment || seen.has(comment.id)) continue;
    seen.add(comment.id);
    result.push(comment);
    if (result.length >= MAX_PATTERN_COMMENTS) break;
  }
  return result;
}

function repairPatternComment(input: unknown, patternIds: Set<string>): PatternComment | null {
  if (!isRecord(input) || !isSafeId(input.id) || typeof input.patternId !== 'string') return null;
  if (!patternIds.has(input.patternId)) return null;
  const authorName = typeof input.authorName === 'string' ? sanitizeText(input.authorName, 60) : null;
  if (!authorName) return null;
  const authorUsername =
    typeof input.authorUsername === 'string' ? sanitizeUsername(input.authorUsername) ?? 'maker' : 'maker';
  const avatarColor =
    typeof input.avatarColor === 'string' ? (normalizeHex(input.avatarColor) ?? '#2F6B4F') : '#2F6B4F';
  const body = typeof input.body === 'string' ? sanitizeText(input.body, MAX_PATTERN_COMMENT_BODY_CHARS) : null;
  if (!body) return null;
  const rating = clampInt(numberOr(input.rating, 5), 1, 5);
  const createdAt = finiteTimestamp(input.createdAt, 1);
  const pinned = input.pinned === true ? true : undefined;
  const photoUri = typeof input.photoUri === 'string' && isCommentPhotoUri(input.photoUri) ? input.photoUri : undefined;
  return {
    id: input.id,
    patternId: input.patternId,
    authorName,
    authorUsername,
    avatarColor,
    rating,
    body,
    createdAt,
    ...(pinned ? { pinned } : {}),
    ...(photoUri ? { photoUri } : {}),
  };
}

function repairFollowedCreators(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of input) {
    if (typeof entry !== 'string') continue;
    const name = sanitizeText(entry, 60);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    result.push(name);
  }
  return result;
}

function repairLikedPatternIds(input: unknown, patterns: CrochetPattern[]): string[] {
  return repairPatternIdList(input, patterns);
}

function repairCollectedPatternIds(input: unknown, patterns: CrochetPattern[]): string[] {
  return repairPatternIdList(input, patterns);
}

function repairPatternIdList(input: unknown, patterns: CrochetPattern[]): string[] {
  const patternIds = new Set(patterns.map((pattern) => pattern.id));
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of input) {
    if (typeof entry !== 'string' || !patternIds.has(entry) || seen.has(entry)) continue;
    seen.add(entry);
    result.push(entry);
  }
  return result;
}

function repairIdeaFolders(input: unknown, patterns: CrochetPattern[]): IdeaFolder[] {
  const patternIds = new Set(patterns.map((pattern) => pattern.id));
  if (!Array.isArray(input)) return [];
  const folders = readArray(input)
    .map((item) => repairIdeaFolder(item, patternIds))
    .filter((item): item is IdeaFolder => item != null);
  return dedupeById(folders).slice(0, MAX_IDEA_FOLDERS);
}

function repairIdeaFolder(input: unknown, patternIds: Set<string>): IdeaFolder | null {
  if (!isRecord(input) || !isSafeId(input.id)) return null;
  const name = typeof input.name === 'string' ? sanitizeText(input.name, MAX_FOLDER_NAME_CHARS) : null;
  if (!name) return null;
  const description = typeof input.description === 'string' ? sanitizeFolderDescription(input.description) : '';
  const now = Date.now();
  const createdAt = finiteTimestamp(input.createdAt, now);
  const updatedAt = finiteTimestamp(input.updatedAt, createdAt);
  const ids = Array.isArray(input.patternIds)
    ? input.patternIds
        .filter((id): id is string => typeof id === 'string' && patternIds.has(id))
        .filter((id, index, list) => list.indexOf(id) === index)
    : [];
  const isDefault = input.isDefault === true;
  const isPrivate = input.isPrivate === true;
  return { id: input.id, name, description, patternIds: ids, createdAt, updatedAt, isDefault, isPrivate };
}
