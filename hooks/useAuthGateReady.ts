import { useCrochetHydrated } from '@/store/useCrochetStore';

/** True once persisted local state has been read — Firebase sync must not block the UI. */
export function useAuthGateReady(): boolean {
  return useCrochetHydrated();
}
