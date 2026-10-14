/**
 * Keeps the user on /welcome until they have an account, and out of /welcome once signed in.
 */
import { useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';

import { useAuthGateReady } from '@/hooks/useAuthGateReady';
import { useCrochetStore } from '@/store/useCrochetStore';

export function AuthRouteSync() {
  const gateReady = useAuthGateReady();
  const account = useCrochetStore((state) => state.account);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (!gateReady) return;

    const onWelcome = segments[0] === 'welcome';

    if (!account && !onWelcome) {
      router.replace('/welcome');
      return;
    }

    if (account && onWelcome) {
      router.replace('/(tabs)');
    }
  }, [account, gateReady, router, segments]);

  return null;
}
