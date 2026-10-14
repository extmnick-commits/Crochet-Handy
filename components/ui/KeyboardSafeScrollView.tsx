import { forwardRef } from 'react';
import { ScrollView, type ScrollViewProps } from 'react-native';

import { Spacing } from '@/constants/BambuTheme';
import { useKeyboardInset } from '@/hooks/useKeyboardInset';

type KeyboardSafeScrollViewProps = ScrollViewProps & {
  /** Extra space below content when the keyboard is open. */
  keyboardPadding?: number;
};

/**
 * ScrollView preset that keeps focused inputs visible when the keyboard opens.
 */
export const KeyboardSafeScrollView = forwardRef<ScrollView, KeyboardSafeScrollViewProps>(
  function KeyboardSafeScrollView(
    { contentContainerStyle, keyboardPadding = Spacing.lg, keyboardShouldPersistTaps = 'handled', ...props },
    ref,
  ) {
    const keyboardInset = useKeyboardInset();

    return (
      <ScrollView
        ref={ref}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={[
          contentContainerStyle,
          keyboardInset > 0 && { paddingBottom: keyboardInset + keyboardPadding },
        ]}
        {...props}
      />
    );
  },
);
