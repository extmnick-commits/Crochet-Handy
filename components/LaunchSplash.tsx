import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Colors, Spacing, Typography } from '@/constants/BambuTheme';

/** Shown while persistence and Firebase auth finish their first pass. */
export function LaunchSplash() {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>Crochet Handy</Text>
      <ActivityIndicator color={Colors.accentPrimary} style={styles.spinner} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.backgroundPrimary,
    gap: Spacing.lg,
  },
  title: {
    ...Typography.headline,
    color: Colors.textPrimary,
  },
  spinner: {
    marginTop: Spacing.sm,
  },
});
