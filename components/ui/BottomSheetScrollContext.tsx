import { createContext, useContext, type ReactNode, type RefObject } from 'react';
import type { ScrollView } from 'react-native';

const BottomSheetScrollContext = createContext<RefObject<ScrollView | null> | null>(null);

export function BottomSheetScrollProvider({
  scrollRef,
  children,
}: {
  scrollRef: RefObject<ScrollView | null>;
  children: ReactNode;
}) {
  return <BottomSheetScrollContext.Provider value={scrollRef}>{children}</BottomSheetScrollContext.Provider>;
}

export function useBottomSheetScrollRef(): RefObject<ScrollView | null> | null {
  return useContext(BottomSheetScrollContext);
}
