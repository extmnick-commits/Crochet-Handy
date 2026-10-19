/**
 * Dimmed, bottom-anchored sheet used by pattern details and the YouTube saver.
 * React Native's Modal keeps this working on web as well as iOS and Android
 * without a native bottom-sheet dependency.
 */
import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomSheetScrollProvider } from '@/components/ui/BottomSheetScrollContext';
import { Colors, Radius, Spacing } from '@/constants/BambuTheme';
import { useKeyboardInset } from '@/hooks/useKeyboardInset';

type BottomSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** Stays put while the body scrolls. */
  header?: ReactNode;
  children: ReactNode;
  /** Stays put under the body, above the home indicator. */
  footer?: ReactNode;
  onDismiss?: () => void;
  /** Restored once when the sheet opens. */
  initialScrollOffset?: number;
  onScrollOffsetChange?: (offset: number) => void;
  sheetStyle?: ViewStyle;
  handleStyle?: ViewStyle;
};

export function BottomSheet({
  visible,
  onClose,
  header,
  children,
  footer,
  onDismiss,
  initialScrollOffset = 0,
  onScrollOffsetChange,
  sheetStyle,
  handleStyle,
}: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const keyboardInset = useKeyboardInset();
  const scrollRef = useRef<ScrollView>(null);
  const offsetRef = useRef(0);
  const scrolledRef = useRef(false);
  const wasVisible = useRef(false);
  const restorePending = useRef(false);

  useEffect(() => {
    if (visible && !wasVisible.current) {
      scrolledRef.current = false;
      restorePending.current = initialScrollOffset > 0;
    }
    if (!visible && wasVisible.current && scrolledRef.current) {
      onScrollOffsetChange?.(offsetRef.current);
    }
    wasVisible.current = visible;
  }, [initialScrollOffset, onScrollOffsetChange, visible]);

  const maxHeight = Math.round(height * 0.92);
  const bottomPad = Math.max(insets.bottom, 12);
  const reserved = 36 + bottomPad + (header ? 72 : 0) + (footer ? 76 : 0);
  const scrollMaxHeight = Math.max(180, maxHeight - reserved - (keyboardInset > 0 ? keyboardInset * 0.35 : 0));

  const keyboardOffset = Platform.OS === 'ios' ? Spacing.sm : 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} onDismiss={onDismiss} statusBarTranslucent>
      <KeyboardAvoidingView
        style={[styles.root, { minHeight: height }]}
        behavior={Platform.OS === 'web' ? undefined : 'padding'}
        keyboardVerticalOffset={keyboardOffset}
      >
        <Pressable accessibilityLabel="Close sheet" style={styles.scrim} onPress={onClose} />
        <View style={[styles.sheet, { maxHeight, paddingBottom: bottomPad }, sheetStyle]}>
          <View style={[styles.handle, handleStyle]} />
          {header}
          <BottomSheetScrollProvider scrollRef={scrollRef}>
            <ScrollView
              ref={scrollRef}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              automaticallyAdjustKeyboardInsets
              onScroll={(event) => {
                offsetRef.current = event.nativeEvent.contentOffset.y;
              }}
              onScrollBeginDrag={() => {
                scrolledRef.current = true;
              }}
              onContentSizeChange={() => {
                if (!restorePending.current) return;
                restorePending.current = false;
                scrollRef.current?.scrollTo({ y: initialScrollOffset, animated: false });
              }}
              scrollEventThrottle={16}
              showsVerticalScrollIndicator={false}
              style={{ maxHeight: scrollMaxHeight }}
              contentContainerStyle={[
                styles.scrollContent,
                keyboardInset > 0 && { paddingBottom: keyboardInset + Spacing.md },
              ]}
            >
              {children}
            </ScrollView>
          </BottomSheetScrollProvider>
          {footer}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: Colors.scrim,
  },
  sheet: {
    width: '100%',
    zIndex: 1,
    backgroundColor: Colors.cardSurface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    overflow: 'hidden',
  },
  scrollContent: {
    flexGrow: 0,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    marginTop: 8,
    marginBottom: 8,
    borderRadius: Radius.pill,
    backgroundColor: Colors.elevatedControl,
  },
});
