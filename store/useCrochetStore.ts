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
import { parseYouTubeUrl } from '@/utils/youtube';
import {
  activeProject,
  applyAddPattern,
  applyAddStashItem,
  applyAssignStashToSlot,
  applyClearSlot,
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
  applySetStitchesPerRow,
  applySetTotalRows,
  applyStartTimer,
  applyToggleTimer,
  applyUndoLastTap,
  applyUnlinkSlot,
  applyUpdateSlot,
  applyUpdateStashItem,
  createId,
  elapsedSeconds,
  repairPersisted,
  type AmsSlotId,
  type CreateProjectInput,
  type CrochetData,
  type CrochetPattern,
  type CrochetPersistedSlice,
  type CrochetProject,
  type NewPatternInput,
  type NewYarnInput,
  type YarnSlotPatch,
  type YarnStashItem,
  type YarnStashPatch,
} from './machine';
import { createSeedData } from './seed';

export type {
  AmsSlotId,
  AmsSlots,
  AmsYarnSlot,
  CounterSnapshot,
  CrochetPattern,
  CrochetProject,
  PatternDifficulty,
  ProjectStatus,
  YarnStashItem,
  YarnWeight,
} from './machine';

export {
  AMS_SLOT_IDS,
  elapsedSeconds,
  elapsedWholeSeconds,
  formatElapsed,
  isSlotEmpty,
  isTimerRunning,
  projectProgress,
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
  addPatternFromYouTube: (input: NewPatternInput) => string | null;
  removePattern: (patternId: string) => void;
  addStashItem: (input: NewYarnInput) => string | null;
  updateStashItem: (stashItemId: string, patch: YarnStashPatch) => void;
  removeStashItem: (stashItemId: string) => void;
  assignStashToSlot: (slotId: AmsSlotId, stashItemId: string) => void;
  updateSlot: (slotId: AmsSlotId, patch: YarnSlotPatch) => void;
  unlinkSlot: (slotId: AmsSlotId) => void;
  clearSlot: (slotId: AmsSlotId) => void;
  resetToSeed: () => void;
};

export type CrochetStore = CrochetData &
  CrochetActions & {
    /** False until disk/localStorage has been read. Seed values are showing until then. */
    hydrated: boolean;
  };

function readData(state: CrochetStore): CrochetData {
  return {
    patterns: state.patterns,
    projects: state.projects,
    activeProjectId: state.activeProjectId,
    yarnStash: state.yarnStash,
    tapHistory: state.tapHistory,
  };
}

function partializeCrochetState(state: CrochetStore): CrochetPersistedSlice {
  return {
    patterns: state.patterns,
    projects: state.projects,
    activeProjectId: state.activeProjectId,
    yarnStash: state.yarnStash,
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
        const reconciled = applyReconcileTimers(readData(get()), Date.now());
        set(reconciled ? { ...reconciled, hydrated: true } : { hydrated: true });
      };

      return {
        ...createSeedData(),
        tapHistory: {},
        hydrated: false,

        incrementStitch: (autoAdvance) => commit((data, now) => applyIncrementStitch(data, now, autoAdvance)),
        decrementStitch: () => commit(applyDecrementStitch),
        incrementRow: () => commit(applyIncrementRow),
        decrementRow: () => commit(applyDecrementRow),
        undoLastTap: () => commit(applyUndoLastTap),
        setStitchesPerRow: (value) => commit((data, now) => applySetStitchesPerRow(data, value, now)),
        setTotalRows: (value) => commit((data, now) => applySetTotalRows(data, value, now)),

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
          set(next);
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

        addPatternFromYouTube: (input) => {
          const id = createId('pattern');
          const next = applyAddPattern(readData(get()), id, input);
          if (!next) {
            const parsedId = parseYouTubeUrl(input.youtubeUrl)?.videoId ?? null;
            const existing = parsedId ? get().patterns.find((pattern) => pattern.videoId === parsedId) : undefined;
            return existing?.id ?? null;
          }
          set(next);
          return id;
        },
        removePattern: (patternId) => commit((data, now) => applyRemovePattern(data, patternId, now)),

        addStashItem: (input) => {
          const id = createId('yarn');
          const next = applyAddStashItem(readData(get()), id, input);
          if (!next) return null;
          set(next);
          return id;
        },
        updateStashItem: (stashItemId, patch) =>
          commit((data, now) => applyUpdateStashItem(data, stashItemId, patch, now)),
        removeStashItem: (stashItemId) => commit((data, now) => applyRemoveStashItem(data, stashItemId, now)),
        assignStashToSlot: (slotId, stashItemId) =>
          commit((data, now) => applyAssignStashToSlot(data, slotId, stashItemId, now)),
        updateSlot: (slotId, patch) => commit((data, now) => applyUpdateSlot(data, slotId, patch, now)),
        unlinkSlot: (slotId) => commit((data, now) => applyUnlinkSlot(data, slotId, now)),
        clearSlot: (slotId) => commit((data, now) => applyClearSlot(data, slotId, now)),

        resetToSeed: () => {
          enablePersistWrites();
          set({ ...createSeedData(), tapHistory: {}, hydrated: true });
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
        return {
          ...current,
          ...repaired,
          tapHistory: {},
          hydrated: current.hydrated,
        };
      },
      migrate: (persisted) => persisted as CrochetPersistedSlice,
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

/** True once storage has been read. On web this is usually true on the first render. */
export function useCrochetHydrated(): boolean {
  const hydrated = useCrochetStore((state) => state.hydrated);
  const [fallback, setFallback] = useState(useCrochetStore.persist.hasHydrated());

  useEffect(() => {
    if (useCrochetStore.persist.hasHydrated()) {
      setFallback(true);
      return undefined;
    }
    return useCrochetStore.persist.onFinishHydration(() => {
      setFallback(true);
    });
  }, []);

  return hydrated || fallback;
}
