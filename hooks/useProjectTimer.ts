/**
 * Display clock for a project timer.
 *
 * The interval only forces a re-render. The number itself is always
 * `accumulatedSeconds + (now - timerStartedAt)`, so a locked screen or a
 * backgrounded tab cannot drift it — the next paint just reads the clock.
 */
import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { elapsedWholeSeconds, formatElapsed } from '@/store/machine';
import { useCrochetStore } from '@/store/useCrochetStore';

export function useProjectTimer(projectId?: string | null) {
  const activeProjectId = useCrochetStore((state) => state.activeProjectId);
  const id = projectId === undefined ? activeProjectId : projectId;
  const project = useCrochetStore((state) => state.projects.find((item) => item.id === id) ?? null);
  const reconcileTimers = useCrochetStore((state) => state.reconcileTimers);
  const hydrated = useCrochetStore((state) => state.hydrated);
  const timerStartedAt = project?.timerStartedAt ?? null;
  const running = timerStartedAt != null;
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!hydrated || !running) return undefined;

    const refresh = () => {
      if (timerStartedAt != null && timerStartedAt > Date.now()) reconcileTimers();
      setTick((tick) => tick + 1);
    };

    const interval = setInterval(refresh, 1000);
    const appStateSub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        reconcileTimers();
        refresh();
      }
    });

    const onVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        reconcileTimers();
        refresh();
      }
    };
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility);
    }

    return () => {
      clearInterval(interval);
      appStateSub.remove();
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
    };
  }, [hydrated, reconcileTimers, running, timerStartedAt]);

  const seconds = project ? elapsedWholeSeconds(project) : 0;

  return {
    project,
    running,
    hydrated,
    seconds,
    label: formatElapsed(seconds),
  };
}
