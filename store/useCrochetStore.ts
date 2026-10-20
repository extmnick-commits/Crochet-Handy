/**
 * Crochet Handy store.
 *
 * Persistence writes wait until hydration finishes. On device that read is
 * async; a tap in the gap used to overwrite the saved project with the seed.
 * After hydration, any running timer whose anchor is in the future (the clock
 * moved backwards while the app was closed) is rebased before it is shown.
 */
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { crochetStateStorage, CROCHET_STORAGE_KEY, CROCHET_STORAGE_VERSION, enablePersistWrites } from '@/utils/storage';
import { isFirebaseConfigured } from '@/utils/firebase';
import { pullPatternCatalogUpdates, syncRemotePatternCatalog } from '@/utils/syncPatternCatalog';
import {
  activeProject,
  applyAddCheckpoint,
  applyAddPattern,
  applyAddProjectYarnColor,
  applyAddStashItem,
  applyCreateProject,
  applyDecrementRow,
  applyDecrementStitch,
  applyDeleteProject,
  applyFinishProject,
  applyIncrementRow,
  applyIncrementStitch,
  applyPauseTimer,
  applyReconcileTimers,
  applyRemovePattern,
  applyRemoveStashItem,
  applyRenameProject,
  applyReopenProject,
  applyResetTimer,
  applySetActiveProject,
  applySetPatternBookmarks,
  applySetHookAndYarn,
  applySetStitchesPerRow,
  applySetTotalRows,
  applyStartTimer,
  applyToggleTimer,
  applyUndoLastTap,
  applyAddProgressPhoto,
  applyCreateCollectionFolder,
  applyDeleteCollectionFolder,
  applyRenameCollectionFolder,
  applyToggleCollectPattern,
  applyUpdateCollectionFolder,
  applyHydrateCloudSlice,
  applyRemoveCheckpoint,
  applyRemoveProgressPhoto,
  applyRemoveProjectYarnColor,
  applySetAccount,
  applySetRowNote,
  applyAppendRowNote,
  applyAddPatternComment,
  applyRemovePatternComment,
  applyToggleFollowCreator,
  applyToggleLikePattern,
  applyTogglePatternInFolder,
  applySetPatternInFolders,
  applyCollectPatternToDefaultFolder,
  applyEnsureDefaultCollectionFolder,
  DEFAULT_COLLECTION_NAME,
  applyUpdateAccountProfile,
  applyRecordUpload,
  applyUploadQuota,
  canUploadToday,
  applyUpdateProjectYarnColor,
  applyUpdateStashItem,
  createId,
  elapsedSeconds,
  findExistingPatternId,
  collectReferencedPatternIds,
  reconcilePatternCatalog,
  repairPersisted,
  type CreateProjectInput,
  type CrochetData,
  type CrochetPattern,
  type CrochetPersistedSlice,
  type CrochetProject,
  type IdeaFolder,
  type NewPatternCommentInput,
  type NewPatternInput,
  type PatternComment,
  type UserAccount,
  type UploadQuota,
  type VideoBookmark,
  type NewProgressPhotoInput,
  type NewProjectYarnColorInput,
  type NewVideoCheckpointInput,
  type NewYarnInput,
  type ProjectYarnColorPatch,
  type YarnStashItem,
  type YarnStashPatch,
  type YarnWeight,
} from './machine';
import { createSeedData } from './seed';

export type {
  CounterSnapshot,
  CrochetPattern,
  CrochetProject,
  IdeaFolder,
  PatternComment,
  PatternDifficulty,
  ProjectStatus,
  MilestoneTag,
  ProgressPhoto,
  ProjectYarnColor,
  UserAccount,
  VideoBookmark,
  VideoCheckpoint,
  YarnStashItem,
  YarnWeight,
} from './machine';

export {
  elapsedSeconds,
  elapsedWholeSeconds,
  formatCheckpointTime,
  formatElapsed,
  isTimerRunning,
  MAX_COUNT,
  MILESTONE_TAGS,
  MAX_PROJECT_YARN_COLORS,
  MAX_SKEINS,
  MAX_VIDEO_CHECKPOINTS,
  fitCrochetPersistedSliceForFirestore,
  progressPhotoCreatedAtIso,
  projectProgress,
  rowPercent,
  stitchesDone,
  YARN_WEIGHTS,
} from './machine';

type CrochetActions = {
  incrementStitch: (autoAdvance?: boolean) => void;
  decrementStitch: () => void;
  incrementRow: () => void;
  decrementRow: () => void;
  undoLastTap: () => void;
  setStitchesPerRow: (value: number) => void;
  setTotalRows: (value: number) => void;
  setHookAndYarn: (patch: { hookSize?: string; yarnWeight?: YarnWeight }) => void;
  startTimer: () => void;
  pauseTimer: () => void;
  resetTimer: () => void;
  toggleTimer: () => void;
  /** Rebase a running timer if the device clock moved backwards. */
  reconcileTimers: () => void;
  /** Elapsed seconds for the active project, including the open segment. */
  getElapsedSeconds: (now?: number) => number;
  createProject: (input: CreateProjectInput) => string | null;
  setActiveProject: (projectId: string | null) => void;
  renameProject: (name: string) => void;
  finishProject: () => void;
  reopenProject: () => void;
  deleteProject: (projectId: string) => void;
  /** Returns the new id, or the existing pattern id when that video is already saved. */
  addPatternFromYouTube: (input: NewPatternInput, id?: string) => string | null;
  /** Replace a pattern's bookmarks when YouTube chapters are found. */
  setPatternBookmarks: (patternId: string, bookmarks: VideoBookmark[]) => void;
  removePattern: (patternId: string) => void;
  addStashItem: (input: NewYarnInput, id?: string) => string | null;
  updateStashItem: (stashItemId: string, patch: YarnStashPatch) => void;
  removeStashItem: (stashItemId: string) => void;
  setRowNote: (note: string) => void;
  /** Appends a decoded row or calculation onto the active project's row note. */
  appendRowNote: (note: string) => void;
  addProjectYarnColor: (input: NewProjectYarnColorInput) => string | null;
  updateProjectYarnColor: (colorId: string, patch: ProjectYarnColorPatch) => void;
  removeProjectYarnColor: (colorId: string) => void;
  addCheckpoint: (input: NewVideoCheckpointInput) => string | null;
  removeCheckpoint: (checkpointId: string) => void;
  /** Returns the new photo id, or null when the still can't be stored. */
  addProgressPhoto: (input: NewProgressPhotoInput) => string | null;
  removeProgressPhoto: (photoId: string) => void;
  resetToSeed: () => void;
  /** Pull-to-refresh: merge bundled seed and remote scraper catalog. */
  refreshPatternCatalog: () => Promise<number>;
  setAccount: (account: UserAccount | null) => void;
  /** Counts one basic upload on this device when Firebase is not configured. */
  recordLocalUpload: () => boolean;
  /** Replaces the local counter with the quota committed in Firestore. */
  setUploadQuota: (quota: UploadQuota) => void;
  updateAccountProfile: (patch: {
    displayName?: string;
    username?: string;
    bio?: string;
    avatarColor?: string;
  }) => void;
  toggleLikePattern: (patternId: string) => void;
  toggleCollectPattern: (patternId: string) => void;
  addPatternComment: (input: NewPatternCommentInput) => string | null;
  removePatternComment: (commentId: string) => void;
  toggleFollowCreator: (creator: string) => void;
  createCollectionFolder: (input: { name: string; description?: string; isPrivate?: boolean }) => string | null;
  createFolder: (name: string, isPrivate?: boolean) => string | null;
  renameCollectionFolder: (folderId: string, name: string) => void;
  updateCollectionFolder: (folderId: string, patch: { name?: string; description?: string }) => void;
  deleteCollectionFolder: (folderId: string) => void;
  togglePatternInFolder: (folderId: string, patternId: string) => void;
  /** Set folder membership for a pattern to exactly `folderIds` (multi-select confirm). */
  togglePatternInFolders: (patternId: string, folderIds: string[]) => void;
  /** Add pattern to the default collection; returns the folder display name. */
  collectPatternToDefault: (patternId: string) => string | null;
  hydrateFromCloud: (cloudRaw: unknown) => void;
  setAuthSessionReady: (ready: boolean) => void;
};

export type CrochetStore = CrochetData &
  CrochetActions & {
    /** False until disk/localStorage has been read. Seed values are showing until then. */
    hydrated: boolean;
    /** False until Firebase's first auth callback finishes (always true when Firebase is off). */
    authSessionReady: boolean;
  };

function readData(state: CrochetStore): CrochetData {
  return {
    patterns: state.patterns,
    projects: state.projects,
    activeProjectId: state.activeProjectId,
    yarnStash: state.yarnStash,
    progressPhotos: state.progressPhotos,
    account: state.account,
    likedPatternIds: state.likedPatternIds,
    collectedPatternIds: state.collectedPatternIds,
    collectionFolders: state.collectionFolders,
    patternComments: state.patternComments,
    followedCreators: state.followedCreators,
    tapHistory: state.tapHistory,
  };
}

export function partializeCrochetState(state: CrochetStore): CrochetPersistedSlice {
  return {
    patterns: state.patterns,
    projects: state.projects,
    activeProjectId: state.activeProjectId,
    yarnStash: state.yarnStash,
    progressPhotos: state.progressPhotos,
    account: state.account,
    likedPatternIds: state.likedPatternIds,
    collectedPatternIds: state.collectedPatternIds,
    collectionFolders: state.collectionFolders,
    patternComments: state.patternComments,
    followedCreators: state.followedCreators,
  };
}

let markHydrated: (() => void) | null = null;

export const useCrochetStore = create<CrochetStore>()(
  persist(
    (set, get) => {
      const commit = (recipe: (data: CrochetData, now: number) => CrochetData | null) => {
        const next = recipe(readData(get()), Date.now());
        if (next) set(next);
      };

      markHydrated = () => {
        enablePersistWrites();
        const data = readData(get());
        const bundled = createSeedData().patterns;
        const retain = collectReferencedPatternIds(data);
        const patterns = reconcilePatternCatalog(data.patterns, bundled, [], retain);
        const withCatalog = { ...data, patterns };
        const reconciled = applyReconcileTimers(withCatalog, Date.now());
        set(reconciled ? { ...reconciled, hydrated: true } : { ...withCatalog, hydrated: true });

        void syncRemotePatternCatalog(
          () => readData(get()),
          (next) => {
            const synced = applyReconcileTimers(next, Date.now());
            set((state) => ({ ...state, ...(synced ?? next) }));
          },
          bundled,
        );
      };

      return {
        ...createSeedData(),
        tapHistory: {},
        hydrated: false,
        authSessionReady: !isFirebaseConfigured(),
        setAuthSessionReady: (ready) => set({ authSessionReady: ready }),

        incrementStitch: (autoAdvance) => commit((data, now) => applyIncrementStitch(data, now, autoAdvance)),
        decrementStitch: () => commit(applyDecrementStitch),
        incrementRow: () => commit(applyIncrementRow),
        decrementRow: () => commit(applyDecrementRow),
        undoLastTap: () => commit(applyUndoLastTap),
        setStitchesPerRow: (value) => commit((data, now) => applySetStitchesPerRow(data, value, now)),
        setTotalRows: (value) => commit((data, now) => applySetTotalRows(data, value, now)),
        setHookAndYarn: (patch) => commit((data, now) => applySetHookAndYarn(data, patch, now)),

        startTimer: () => commit(applyStartTimer),
        pauseTimer: () => commit(applyPauseTimer),
        resetTimer: () => commit(applyResetTimer),
        toggleTimer: () => commit(applyToggleTimer),
        reconcileTimers: () => commit(applyReconcileTimers),
        getElapsedSeconds: (now = Date.now()) => {
          const project = activeProject(readData(get()));
          return project ? elapsedSeconds(project, now) : 0;
        },

        createProject: (input) => {
          const id = createId('project');
          const next = applyCreateProject(readData(get()), input, id, Date.now());
          if (!next) return null;
          set((state) => ({ ...state, ...next }));
          return id;
        },
        setActiveProject: (projectId) => commit((data, now) => applySetActiveProject(data, projectId, now)),
        renameProject: (name) => commit((data, now) => applyRenameProject(data, name, now)),
        finishProject: () => commit(applyFinishProject),
        reopenProject: () => commit(applyReopenProject),
        deleteProject: (projectId) => {
          const next = applyDeleteProject(readData(get()), projectId);
          if (next) set(next);
        },

        setPatternBookmarks: (patternId, bookmarks) =>
          commit((data) => applySetPatternBookmarks(data, patternId, bookmarks)),
        addPatternFromYouTube: (input, preferredId) => {
          const id = preferredId ?? createId('pattern');
          const next = applyAddPattern(readData(get()), id, input);
          if (!next) return findExistingPatternId(get().patterns, input);
          set(next);
          return id;
        },
        removePattern: (patternId) => commit((data, now) => applyRemovePattern(data, patternId, now)),

        addStashItem: (input, preferredId) => {
          const id = preferredId ?? createId('yarn');
          const next = applyAddStashItem(readData(get()), id, input);
          if (!next) return null;
          set(next);
          return id;
        },
        updateStashItem: (stashItemId, patch) =>
          commit((data, now) => applyUpdateStashItem(data, stashItemId, patch, now)),
        removeStashItem: (stashItemId) => commit((data, now) => applyRemoveStashItem(data, stashItemId, now)),
        setRowNote: (note) => commit((data, now) => applySetRowNote(data, note, now)),
        appendRowNote: (note) => commit((data, now) => applyAppendRowNote(data, note, now)),
        addProjectYarnColor: (input) => {
          const id = createId('color');
          const next = applyAddProjectYarnColor(readData(get()), id, input, Date.now());
          if (!next) return null;
          set(next);
          return id;
        },
        updateProjectYarnColor: (colorId, patch) =>
          commit((data, now) => applyUpdateProjectYarnColor(data, colorId, patch, now)),
        removeProjectYarnColor: (colorId) => commit((data, now) => applyRemoveProjectYarnColor(data, colorId, now)),
        addCheckpoint: (input) => {
          const id = createId('cp');
          const next = applyAddCheckpoint(readData(get()), id, input, Date.now());
          if (!next) return null;
          set(next);
          return id;
        },
        removeCheckpoint: (checkpointId) => commit((data, now) => applyRemoveCheckpoint(data, checkpointId, now)),

        addProgressPhoto: (input) => {
          const id = createId('photo');
          const next = applyAddProgressPhoto(readData(get()), id, input);
          if (!next) return null;
          set(next);
          return id;
        },
        removeProgressPhoto: (photoId) => {
          const next = applyRemoveProgressPhoto(readData(get()), photoId);
          if (next) set(next);
        },

        resetToSeed: () => {
          enablePersistWrites();
          set({ ...createSeedData(), tapHistory: {}, hydrated: true });
        },

        refreshPatternCatalog: async () =>
          pullPatternCatalogUpdates(
            () => readData(get()),
            (next) => {
              const reconciled = applyReconcileTimers(next, Date.now());
              set((state) => ({ ...state, ...(reconciled ?? next) }));
            },
            createSeedData().patterns,
          ),

        setAccount: (account) => commit((data) => applySetAccount(data, account)),
        recordLocalUpload: () => {
          const data = readData(get());
          const now = Date.now();
          if (!data.account || !canUploadToday(data.account, now)) return false;
          const next = applyRecordUpload(data, now);
          if (next) set(next);
          return true;
        },
        setUploadQuota: (quota) => {
          const next = applyUploadQuota(readData(get()), quota);
          if (next) set(next);
        },
        updateAccountProfile: (patch) => commit((data, now) => applyUpdateAccountProfile(data, patch, now)),
        toggleLikePattern: (patternId) => commit((data) => applyToggleLikePattern(data, patternId)),
        toggleCollectPattern: (patternId) => commit((data) => applyToggleCollectPattern(data, patternId)),
        addPatternComment: (input) => {
          const id = createId('comment');
          const next = applyAddPatternComment(readData(get()), id, input, Date.now());
          if (!next) return null;
          set(next);
          return id;
        },
        removePatternComment: (commentId) => commit((data) => applyRemovePatternComment(data, commentId)),
        toggleFollowCreator: (creator) => commit((data) => applyToggleFollowCreator(data, creator)),
        createCollectionFolder: (input) => {
          const id = createId('folder');
          const now = Date.now();
          const base = applyEnsureDefaultCollectionFolder(readData(get()), now);
          const next = applyCreateCollectionFolder(base, id, input, now);
          if (!next) return null;
          set(next);
          return id;
        },
        createFolder: (name, isPrivate) => get().createCollectionFolder({ name, isPrivate }),
        renameCollectionFolder: (folderId, name) =>
          commit((data, now) => applyRenameCollectionFolder(data, folderId, name, now)),
        updateCollectionFolder: (folderId, patch) =>
          commit((data, now) => applyUpdateCollectionFolder(data, folderId, patch, now)),
        deleteCollectionFolder: (folderId) => commit((data) => applyDeleteCollectionFolder(data, folderId)),
        togglePatternInFolder: (folderId, patternId) =>
          commit((data, now) => applyTogglePatternInFolder(data, folderId, patternId, now)),
        togglePatternInFolders: (patternId, folderIds) =>
          commit((data, now) => applySetPatternInFolders(data, patternId, folderIds, now)),
        collectPatternToDefault: (patternId) => {
          const now = Date.now();
          const result = applyCollectPatternToDefaultFolder(readData(get()), patternId, now);
          if (!result) return null;
          set(result.data);
          return result.folderName;
        },
        hydrateFromCloud: (cloudRaw) => {
          const next = applyHydrateCloudSlice(readData(get()), cloudRaw, createSeedData().patterns, Date.now());
          if (next) set(next);
        },
      };
    },
    {
      name: CROCHET_STORAGE_KEY,
      version: CROCHET_STORAGE_VERSION,
      storage: createJSONStorage(() => crochetStateStorage),
      partialize: partializeCrochetState,
      merge: (persisted, current) => {
        const repaired = repairPersisted(persisted, Date.now());
        if (!repaired) return current;
        const retain = collectReferencedPatternIds(repaired);
        const patterns = reconcilePatternCatalog(repaired.patterns, current.patterns, [], retain);
        return {
          ...current,
          ...repaired,
          patterns,
          tapHistory: {},
          hydrated: current.hydrated,
          authSessionReady: current.authSessionReady,
        };
      },
      migrate: (persisted, fromVersion) => {
        const slice = persisted as CrochetPersistedSlice;
        if (fromVersion >= CROCHET_STORAGE_VERSION) return slice;
        const repaired = repairPersisted(slice, Date.now());
        if (!repaired) return slice;
        const bundled = createSeedData().patterns;
        const retain = collectReferencedPatternIds(repaired);
        return {
          ...repaired,
          patterns: reconcilePatternCatalog(repaired.patterns, bundled, [], retain),
        };
      },
      onRehydrateStorage: () => (_state, error) => {
        if (error) enablePersistWrites();
        markHydrated?.();
      },
    },
  ),
);

export function selectActiveProject(state: CrochetStore): CrochetProject | null {
  return activeProject(state);
}

export function selectCanUndo(state: CrochetStore): boolean {
  if (!state.activeProjectId) return false;
  return (state.tapHistory[state.activeProjectId]?.length ?? 0) > 0;
}

export function selectPattern(state: CrochetStore, patternId: string | null): CrochetPattern | null {
  if (!patternId) return null;
  return state.patterns.find((pattern) => pattern.id === patternId) ?? null;
}

export function selectStashItem(state: CrochetStore, stashItemId: string | null): YarnStashItem | null {
  if (!stashItemId) return null;
  return state.yarnStash.find((item) => item.id === stashItemId) ?? null;
}

export function selectIsPatternLiked(state: CrochetStore, patternId: string): boolean {
  return state.likedPatternIds.includes(patternId);
}

export function selectIsPatternCollected(state: CrochetStore, patternId: string): boolean {
  return state.collectedPatternIds.includes(patternId);
}

export function selectIsCreatorFollowed(state: CrochetStore, creator: string): boolean {
  return state.followedCreators.includes(creator);
}

export function selectPatternComments(state: CrochetStore, patternId: string): PatternComment[] {
  return state.patternComments.filter((comment) => comment.patternId === patternId);
}

export function selectFoldersForPattern(state: CrochetStore, patternId: string): IdeaFolder[] {
  return state.collectionFolders.filter((folder) => folder.patternIds.includes(patternId));
}

export function selectDefaultCollectionFolder(state: CrochetStore): IdeaFolder | null {
  return state.collectionFolders.find((folder) => folder.isDefault) ?? state.collectionFolders[0] ?? null;
}

export { DEFAULT_COLLECTION_NAME };

/** True once storage has been read. On web this is usually true on the first render. */
export function useCrochetHydrated(): boolean {
  const hydrated = useCrochetStore((state) => state.hydrated);
  const [fallback, setFallback] = useState(useCrochetStore.persist.hasHydrated());

  useEffect(() => {
    if (useCrochetStore.persist.hasHydrated()) {
      return undefined;
    }
    return useCrochetStore.persist.onFinishHydration(() => {
      setFallback(true);
    });
  }, []);

  return hydrated || fallback;
}
