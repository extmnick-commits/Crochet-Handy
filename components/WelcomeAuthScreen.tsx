/**
 * Full-screen welcome + sign-in shown before the main app when there is no account.
 */
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthAccountForm } from '@/components/AuthAccountForm';
import { WelcomePatternBackdrop } from '@/components/WelcomePatternBackdrop';
import { Colors, FontWeight, Layout, Spacing, Typography } from '@/constants/BambuTheme';
import { isFirebaseConfigured } from '@/utils/firebase';

export function WelcomeAuthScreen() {
  const insets = useSafeAreaInsets();
  const firebaseReady = isFirebaseConfigured();

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'web' ? undefined : 'padding'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + Spacing.sm : 0}
    >
      <WelcomePatternBackdrop />
      <View
        style={[
          styles.shell,
          {
            paddingTop: insets.top + Spacing.md,
            paddingBottom: Math.max(insets.bottom, Spacing.lg),
            paddingHorizontal: Layout.screenGutter,
          },
        ]}
      >
        <View style={styles.inner}>
          <View style={styles.hero}>
            <Text accessibilityRole="header" style={styles.brand}>
              Crochet Handy
            </Text>
            <Text style={styles.tagline}>
              Track patterns, stash, and projects — {firebaseReady ? 'backed up to the cloud' : 'on your device'}.
            </Text>
          </View>

          <View style={styles.form}>
            <AuthAccountForm
              layout="screen"
              initialMode="sign-in"
              account={null}
              bottomInset={0}
              onSuccess={() => {
                // Navigation is driven by account state in welcome.tsx / tab guard.
              }}
            />
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: '100%',
    backgroundColor: Platform.OS === 'web' ? Colors.transparent : Colors.backgroundPrimary,
  },
  shell: {
    flex: 1,
    width: '100%',
    zIndex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  inner: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    flex: 1,
    minHeight: 0,
  },
  hero: {
    gap: Spacing.sm,
    paddingBottom: Spacing.md,
    alignItems: 'center',
  },
  form: {
    width: '100%',
    flex: 1,
    minHeight: 0,
  },
  brand: {
    ...Typography.title,
    fontSize: 28,
    lineHeight: 34,
    color: Colors.textPrimary,
    fontWeight: FontWeight.bold,
    textAlign: 'center',
  },
  tagline: {
    ...Typography.body,
    color: Colors.textSecondary,
    lineHeight: 24,
    textAlign: 'center',
    maxWidth: 360,
  },
});
