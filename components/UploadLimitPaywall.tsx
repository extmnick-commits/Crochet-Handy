/**
 * Shown when a basic member has already used today's 3 uploads.
 * Premium is granted on the account from the Admin SDK, not from this screen.
 */
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, FontWeight, Radius, Spacing, Typography } from '@/constants/BambuTheme';

type UploadLimitPaywallProps = {
  onDismiss: () => void;
};

export function UploadLimitPaywall({ onDismiss }: UploadLimitPaywallProps) {
  return (
    <View style={styles.card} testID="upload-limit-paywall">
      <Text role="heading" aria-level={3} style={styles.title}>
        Daily limit reached
      </Text>
      <Text accessibilityLiveRegion="polite" style={styles.body}>
        Basic membership includes 3 uploads a day, shared by new patterns and yarn. Premium has no daily limit.
        Premium is added to your account from the membership service.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss upgrade prompt"
        onPress={onDismiss}
        style={({ pressed }) => [styles.button, pressed && styles.pressed, webCursor]}
      >
        <Text style={styles.buttonText}>Not now</Text>
      </Pressable>
    </View>
  );
}

const webCursor = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : null;

const styles = StyleSheet.create({
  card: {
    gap: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.elevatedControl,
    padding: Spacing.lg,
  },
  title: {
    ...Typography.headline,
    color: Colors.textPrimary,
  },
  body: {
    ...Typography.callout,
    color: Colors.textSecondary,
  },
  button: {
    minHeight: 48,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accentPrimary,
  },
  buttonText: {
    ...Typography.body,
    color: Colors.onAccent,
    fontWeight: FontWeight.semibold,
  },
  pressed: {
    opacity: 0.72,
  },
});
