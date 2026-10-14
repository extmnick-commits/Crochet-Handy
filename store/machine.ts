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
import { parseYouTubeUrl } from '../utils/youtube';

export const AMS_SLOT_IDS = ['A1', 'A2', 'A3', 'A4'] as const;
export const MAX_TAP_HISTORY = 30;
export const MAX_COUNT = 9999;
/** Skeins of one color the stash stepper will count up to. */
export const MAX_SKEINS = 48;
/** Stills kept per project so a story reel stays a row-by-row timelapse. */
export const MAX_PROGRESS_PHOTOS = 24;
const MAX_PHOTO_URI = 500_000;
/** Caps a corrupted timestamp that landed in the seconds field (~11 years). */
const MAX_ACCUMULATED_SECONDS = 100_000 * 60 * 60;
export const EMPTY_SLOT_COLOR = '#2A2A2D';

export type AmsSlotId = (typeof AMS_SLOT_IDS)[number];

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
  remainingPercent: number;
  /** How many skeins of this color are on the shelf. */
  skeinCount: number;
};

/**
 * One still in a project's Snapchat-style progress reel.
 * The sticker fields are frozen at capture time so later rows don't rewrite the past.
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
  createdAt: number;
};

export type AmsYarnSlot = {
  id: AmsSlotId;
  /** Global stash row this spool is drawn from. Null for an untracked scrap. */
  stashItemId: string | null;
  hexColor: string;
  brand: string;
  colorName: string;
  yarnWeight: YarnWeight | null;
  hookSize: string;
  remainingPercent: number;
};

/** AMS-A is the first four-slot yarn unit, always present and always in order. */
export type AmsSlots = [AmsYarnSlot, AmsYarnSlot, AmsYarnSlot, AmsYarnSlot];

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
  slots: AmsSlots;
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
  tapHistory: Record<string, CounterSnapshot[]>;
};

export type CrochetPersistedSlice = {
  patterns: CrochetPattern[];
  projects: CrochetProject[];
  activeProjectId: string | null;
  yarnStash: YarnStashItem[];
  progressPhotos: ProgressPhoto[];
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
  remainingPercent?: number;
  skeinCount?: number;
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
  createdAt?: number;
};

export type YarnStashPatch = Partial<Omit<YarnStashItem, 'id'>>;

export type YarnSlotPatch = {
  hexColor?: string;
  brand?: string;
  colorName?: string;
  yarnWeight?: YarnWeight | null;
  hookSize?: string;
  remainingPercent?: number;
};

const YARN_WEIGHT_SET: ReadonlySet<string> = new Set(YARN_WEIGHTS);
const DIFFICULTIES: ReadonlySet<string> = new Set(['beginner', 'easy', 'intermediate', 'advanced']);
const EMPTY_HISTORY: CounterSnapshot[] = [];

export function isYarnWeight(value: unknown): value is YarnWeight {
  return typeof value === 'string' && YARN_WEIGHT_SET.has(value);
}

export function isAmsSlotId(value: unknown): value is AmsSlotId {
  return typeof value === 'string' && (AMS_SLOT_IDS as readonly string[]).includes(value);
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

export function emptySlot(id: AmsSlotId): AmsYarnSlot {
  return {
    id,
    stashItemId: null,
    hexColor: EMPTY_SLOT_COLOR,
    brand: '',
    colorName: '',
    yarnWeight: null,
    hookSize: '',
    remainingPercent: 0,
  };
}

export function emptyAmsSlots(): AmsSlots {
  return [emptySlot('A1'), emptySlot('A2'), emptySlot('A3'), emptySlot('A4')];
}

export function slotFromStash(id: AmsSlotId, item: YarnStashItem): AmsYarnSlot {
  return {
    id,
    stashItemId: item.id,
    hexColor: item.hexColor,
    brand: item.brand,
    colorName: item.colorName,
    yarnWeight: item.yarnWeight,
    hookSize: item.hookSize,
    remainingPercent: item.remainingPercent,
  };
}

export function isSlotEmpty(slot: AmsYarnSlot): boolean {
  return slot.stashItemId == null && slot.brand === '' && slot.colorName === '' && slot.remainingPercent === 0;
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
    slots: emptyAmsSlots(),
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
  if (data.patterns.some((item) => item.videoId === pattern.videoId)) return null;
  return { ...data, patterns: [...data.patterns, pattern] };
}

export function applyRemovePattern(data: CrochetData, patternId: string, now: number): CrochetData | null {
  if (!data.patterns.some((pattern) => pattern.id === patternId)) return null;
  return {
    ...data,
    patterns: data.patterns.filter((pattern) => pattern.id !== patternId),
    projects: data.projects.map((project) =>
      project.patternId === patternId ? { ...project, patternId: null, updatedAt: now } : project,
    ),
  };
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
  const projects = fanOutStash(data.projects, nextItem, now);
  const projectsChanged = projects.some((project, index) => project !== data.projects[index]);
  return { ...data, yarnStash, projects: projectsChanged ? projects : data.projects };
}

export function applyRemoveStashItem(data: CrochetData, stashItemId: string, now: number): CrochetData | null {
  if (!data.yarnStash.some((item) => item.id === stashItemId)) return null;
  return {
    ...data,
    yarnStash: data.yarnStash.filter((item) => item.id !== stashItemId),
    // Keep the slot's color snapshot so the project still shows what was on the hook.
    projects: data.projects.map((project) => unlinkStashFromProject(project, stashItemId, now)),
  };
}

export function applyAssignStashToSlot(
  data: CrochetData,
  slotId: AmsSlotId,
  stashItemId: string,
  now: number,
): CrochetData | null {
  const project = activeProject(data);
  const item = data.yarnStash.find((yarn) => yarn.id === stashItemId);
  if (!project || !item) return null;
  const current = slotById(project, slotId);
  if (!current) return null;
  const next = slotFromStash(slotId, item);
  if (sameSlot(current, next)) return null;
  return replaceProject(data, replaceSlot(project, next, now));
}

export function applyUpdateSlot(
  data: CrochetData,
  slotId: AmsSlotId,
  patch: YarnSlotPatch,
  now: number,
): CrochetData | null {
  const project = activeProject(data);
  if (!project) return null;
  const slot = slotById(project, slotId);
  if (!slot) return null;
  const patched = applySlotPatch(slot, patch);
  if (!patched) return null;

  if (!patched.stashItemId) {
    return replaceProject(data, replaceSlot(project, patched, now));
  }

  const item = data.yarnStash.find((yarn) => yarn.id === patched.stashItemId);
  if (!item) {
    return replaceProject(data, replaceSlot(project, { ...patched, stashItemId: null }, now));
  }

  const nextItem = stashFromSlot(item, patched);
  // A linked slot writes through to the skein. If the skein didn't change, the
  // edit wasn't something a shared spool can store (for example a blank name).
  if (nextItem === item) return null;

  const yarnStash = data.yarnStash.map((yarn) => (yarn.id === nextItem.id ? nextItem : yarn));
  const projects = fanOutStash(data.projects, nextItem, now);
  return { ...data, yarnStash, projects };
}

export function applyUnlinkSlot(data: CrochetData, slotId: AmsSlotId, now: number): CrochetData | null {
  const project = activeProject(data);
  if (!project) return null;
  const slot = slotById(project, slotId);
  if (!slot?.stashItemId) return null;
  return replaceProject(data, replaceSlot(project, { ...slot, stashItemId: null }, now));
}

export function applyClearSlot(data: CrochetData, slotId: AmsSlotId, now: number): CrochetData | null {
  const project = activeProject(data);
  if (!project) return null;
  const slot = slotById(project, slotId);
  if (!slot) return null;
  const cleared = emptySlot(slotId);
  if (sameSlot(slot, cleared)) return null;
  return replaceProject(data, replaceSlot(project, cleared, now));
}

export function buildPattern(id: string, input: NewPatternInput): CrochetPattern | null {
  if (!isSafeId(id)) return null;
  const parsed = parseYouTubeUrl(input.youtubeUrl);
  const title = sanitizeText(input.title, 120);
  if (!parsed || !title) return null;
  const tags = (input.tags ?? [])
    .map((tag) => sanitizeText(tag, 24))
    .filter((tag): tag is string => Boolean(tag))
    .slice(0, 8);
  return {
    id,
    title,
    creator: sanitizeText(input.creator ?? '', 80) || 'Unknown',
    youtubeUrl: parsed.canonicalUrl,
    videoId: parsed.videoId,
    thumbnailUrl: parsed.thumbnailUrl,
    difficulty: input.difficulty && DIFFICULTIES.has(input.difficulty) ? input.difficulty : 'easy',
    yarnWeight: isYarnWeight(input.yarnWeight) ? input.yarnWeight : 'worsted',
    hookSize: sanitizeHook(input.hookSize ?? ''),
    totalRows: clampInt(input.totalRows ?? 10, 1, MAX_COUNT),
    stitchesPerRow: clampInt(input.stitchesPerRow ?? 10, 1, MAX_COUNT),
    tags,
  };
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
    remainingPercent: clampPercent(input.remainingPercent ?? 100),
    skeinCount: clampInt(input.skeinCount ?? 1, 0, MAX_SKEINS),
  };
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

export function buildProgressPhoto(id: string, input: NewProgressPhotoInput, now = Date.now()): ProgressPhoto | null {
  if (!isSafeId(id) || !isSafeId(input.projectId) || !isProgressPhotoUri(input.uri)) return null;
  const projectName = sanitizeText(input.projectName, 80);
  if (!projectName) return null;
  const totalRows = clampInt(input.totalRows, 1, MAX_COUNT);
  const row = clampInt(input.row, 1, totalRows);
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
    createdAt: finiteTimestamp(input.createdAt, now),
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
  const stashById = new Map(yarnStash.map((item) => [item.id, item]));
  const projects = dedupeById(
    readArray(input.projects)
      .map((item) => repairProject(item, patterns, stashById, now))
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

  return { patterns, projects, activeProjectId, yarnStash, progressPhotos };
}

function repairProgressPhoto(input: unknown): ProgressPhoto | null {
  if (!isRecord(input) || !isSafeId(input.id) || !isSafeId(input.projectId)) return null;
  if (typeof input.uri !== 'string' || !isProgressPhotoUri(input.uri)) return null;
  const projectName = typeof input.projectName === 'string' ? sanitizeText(input.projectName, 80) : null;
  if (!projectName) return null;
  const totalRows = clampInt(numberOr(input.totalRows, 1), 1, MAX_COUNT);
  return {
    id: input.id,
    projectId: input.projectId,
    uri: input.uri,
    projectName,
    row: clampInt(numberOr(input.row, 1), 1, totalRows),
    totalRows,
    percent: clampPercent(numberOr(input.percent, 0)),
    elapsedSeconds: bankSeconds(numberOr(input.elapsedSeconds, 0)),
    hookSize: typeof input.hookSize === 'string' ? sanitizeHook(input.hookSize) : '',
    createdAt: finiteTimestamp(input.createdAt, 1),
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

function replaceSlot(project: CrochetProject, slot: AmsYarnSlot, now: number): CrochetProject {
  return {
    ...project,
    slots: project.slots.map((item) => (item.id === slot.id ? slot : item)) as AmsSlots,
    updatedAt: now,
  };
}

function slotById(project: CrochetProject, slotId: AmsSlotId): AmsYarnSlot | null {
  return project.slots.find((slot) => slot.id === slotId) ?? null;
}

function fanOutStash(projects: CrochetProject[], item: YarnStashItem, now: number): CrochetProject[] {
  return projects.map((project) => {
    let changed = false;
    const slots = project.slots.map((slot) => {
      if (slot.stashItemId !== item.id) return slot;
      const next = slotFromStash(slot.id, item);
      if (sameSlot(slot, next)) return slot;
      changed = true;
      return next;
    }) as AmsSlots;
    return changed ? { ...project, slots, updatedAt: now } : project;
  });
}

function unlinkStashFromProject(project: CrochetProject, stashItemId: string, now: number): CrochetProject {
  let changed = false;
  const slots = project.slots.map((slot) => {
    if (slot.stashItemId !== stashItemId) return slot;
    changed = true;
    return { ...slot, stashItemId: null };
  }) as AmsSlots;
  return changed ? { ...project, slots, updatedAt: now } : project;
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
  if (patch.remainingPercent !== undefined && Number.isFinite(patch.remainingPercent)) {
    const remainingPercent = clampPercent(patch.remainingPercent);
    if (remainingPercent !== next.remainingPercent) next = { ...next, remainingPercent };
  }
  if (patch.skeinCount !== undefined && Number.isFinite(patch.skeinCount)) {
    const skeinCount = clampInt(patch.skeinCount, 0, MAX_SKEINS);
    if (skeinCount !== next.skeinCount) next = { ...next, skeinCount };
  }
  return next === item ? null : next;
}

function applySlotPatch(slot: AmsYarnSlot, patch: YarnSlotPatch): AmsYarnSlot | null {
  let next = slot;
  if (patch.hexColor !== undefined) {
    const hexColor = normalizeHex(patch.hexColor);
    if (hexColor && hexColor !== next.hexColor) next = { ...next, hexColor };
  }
  if (patch.brand !== undefined) {
    const brand = sanitizeText(patch.brand, 60) ?? '';
    if (brand !== next.brand) next = { ...next, brand };
  }
  if (patch.colorName !== undefined) {
    const colorName = sanitizeText(patch.colorName, 60) ?? '';
    if (colorName !== next.colorName) next = { ...next, colorName };
  }
  if (patch.yarnWeight !== undefined) {
    const yarnWeight = patch.yarnWeight == null ? null : isYarnWeight(patch.yarnWeight) ? patch.yarnWeight : next.yarnWeight;
    if (yarnWeight !== next.yarnWeight) next = { ...next, yarnWeight };
  }
  if (patch.hookSize !== undefined) {
    const hookSize = sanitizeHook(patch.hookSize);
    if (hookSize !== next.hookSize) next = { ...next, hookSize };
  }
  if (patch.remainingPercent !== undefined && Number.isFinite(patch.remainingPercent)) {
    const remainingPercent = clampPercent(patch.remainingPercent);
    if (remainingPercent !== next.remainingPercent) next = { ...next, remainingPercent };
  }
  return next === slot ? null : next;
}

function stashFromSlot(item: YarnStashItem, slot: AmsYarnSlot): YarnStashItem {
  const next: YarnStashItem = {
    ...item,
    hexColor: slot.hexColor,
    brand: slot.brand || item.brand,
    colorName: slot.colorName || item.colorName,
    yarnWeight: slot.yarnWeight ?? item.yarnWeight,
    hookSize: slot.hookSize,
    remainingPercent: slot.remainingPercent,
  };
  return sameStash(item, next) ? item : next;
}

function sameSlot(a: AmsYarnSlot, b: AmsYarnSlot): boolean {
  return (
    a.id === b.id &&
    a.stashItemId === b.stashItemId &&
    a.hexColor === b.hexColor &&
    a.brand === b.brand &&
    a.colorName === b.colorName &&
    a.yarnWeight === b.yarnWeight &&
    a.hookSize === b.hookSize &&
    a.remainingPercent === b.remainingPercent
  );
}

function sameStash(a: YarnStashItem, b: YarnStashItem): boolean {
  return (
    a.id === b.id &&
    a.hexColor === b.hexColor &&
    a.brand === b.brand &&
    a.colorName === b.colorName &&
    a.yarnWeight === b.yarnWeight &&
    a.hookSize === b.hookSize &&
    a.remainingPercent === b.remainingPercent &&
    a.skeinCount === b.skeinCount
  );
}

function repairPattern(input: unknown): CrochetPattern | null {
  if (!isRecord(input) || !isSafeId(input.id)) return null;
  const title = typeof input.title === 'string' ? sanitizeText(input.title, 120) : null;
  const videoId = typeof input.videoId === 'string' ? input.videoId : '';
  const parsed = parseYouTubeUrl(typeof input.youtubeUrl === 'string' ? input.youtubeUrl : videoId);
  if (!title || !parsed) return null;
  const tags = Array.isArray(input.tags)
    ? input.tags.map((tag) => (typeof tag === 'string' ? sanitizeText(tag, 24) : null)).filter(isPresent).slice(0, 8)
    : [];
  return {
    id: input.id,
    title,
    creator: (typeof input.creator === 'string' && sanitizeText(input.creator, 80)) || 'Unknown',
    youtubeUrl: parsed.canonicalUrl,
    videoId: parsed.videoId,
    thumbnailUrl: parsed.thumbnailUrl,
    difficulty: typeof input.difficulty === 'string' && DIFFICULTIES.has(input.difficulty) ? (input.difficulty as PatternDifficulty) : 'easy',
    yarnWeight: isYarnWeight(input.yarnWeight) ? input.yarnWeight : 'worsted',
    hookSize: typeof input.hookSize === 'string' ? sanitizeHook(input.hookSize) : '',
    totalRows: clampInt(numberOr(input.totalRows, 10), 1, MAX_COUNT),
    stitchesPerRow: clampInt(numberOr(input.stitchesPerRow, 10), 1, MAX_COUNT),
    tags,
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
    remainingPercent: clampPercent(numberOr(input.remainingPercent, 100)),
    skeinCount: clampInt(numberOr(input.skeinCount, 1), 0, MAX_SKEINS),
  };
}

function repairProject(
  input: unknown,
  patterns: CrochetPattern[],
  stashById: Map<string, YarnStashItem>,
  now: number,
): CrochetProject | null {
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
    slots: repairSlots(input.slots, stashById),
    createdAt: finiteTimestamp(input.createdAt, now),
    updatedAt: finiteTimestamp(input.updatedAt, now),
  };
  return reconcileProjectClock(draft, now);
}

function repairSlots(input: unknown, stashById: Map<string, YarnStashItem>): AmsSlots {
  const raw = Array.isArray(input) ? input : [];
  return AMS_SLOT_IDS.map((id, index) => {
    const tagged = raw.find((slot) => isRecord(slot) && slot.id === id);
    const positional = isRecord(raw[index]) ? raw[index] : undefined;
    const source = tagged ?? positional;
    const repaired = source ? repairSlot(id, source) : emptySlot(id);
    if (!repaired.stashItemId) return repaired;
    const item = stashById.get(repaired.stashItemId);
    // Live link: the skein wins over a stale slot copy. A missing skein keeps the snapshot.
    return item ? slotFromStash(id, item) : { ...repaired, stashItemId: null };
  }) as AmsSlots;
}

function repairSlot(id: AmsSlotId, input: Record<string, unknown>): AmsYarnSlot {
  const hexColor = typeof input.hexColor === 'string' ? normalizeHex(input.hexColor) : null;
  return {
    id,
    stashItemId: typeof input.stashItemId === 'string' && isSafeId(input.stashItemId) ? input.stashItemId : null,
    hexColor: hexColor ?? EMPTY_SLOT_COLOR,
    brand: typeof input.brand === 'string' ? (sanitizeText(input.brand, 60) ?? '') : '',
    colorName: typeof input.colorName === 'string' ? (sanitizeText(input.colorName, 60) ?? '') : '',
    yarnWeight: isYarnWeight(input.yarnWeight) ? input.yarnWeight : null,
    hookSize: typeof input.hookSize === 'string' ? sanitizeHook(input.hookSize) : '',
    remainingPercent: clampPercent(numberOr(input.remainingPercent, 0)),
  };
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

function sanitizeHook(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 32);
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function finiteTimestamp(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
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
