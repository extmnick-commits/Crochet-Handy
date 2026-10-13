/**
 * Dimmed, bottom-anchored sheet used by pattern details and the YouTube saver.
 * React Native's Modal keeps this working on web as well as iOS and Android
 * without a native bottom-sheet dependency.
 */
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Radius } from '@/constants/BambuTheme';

type BottomSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** Stays put while the body scrolls. */
  header?: ReactNode;
  children: ReactNode;
  /** Stays put under the body, above the home indicator. */
  footer?: ReactNode;
};

export function BottomSheet({ visible, onClose, header, children, footer }: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const maxHeight = Math.round(height * 0.92);
  const bottomPad = Math.max(insets.bottom, 12);
  const reserved = 36 + bottomPad + (header ? 72 : 0) + (footer ? 76 : 0);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={[styles.root, { minHeight: height }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable accessibilityLabel="Close sheet" style={styles.scrim} onPress={onClose} />
        <View style={[styles.sheet, { maxHeight, paddingBottom: bottomPad }]}>
          <View style={styles.handle} />
          {header}
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={{ maxHeight: Math.max(180, maxHeight - reserved) }}
            contentContainerStyle={styles.scrollContent}
          >
            {children}
          </ScrollView>
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
