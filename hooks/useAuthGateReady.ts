import { useCrochetHydrated, useCrochetStore } from '@/store/useCrochetStore';

/** True when local storage and the first Firebase auth pass are both finished. */
export function useAuthGateReady(): boolean {
  const hydrated = useCrochetHydrated();
  const authSessionReady = useCrochetStore((state) => state.authSessionReady);
  return hydrated && authSessionReady;
}
