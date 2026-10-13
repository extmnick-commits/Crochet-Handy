import { StyleSheet, Text, View } from 'react-native';

import { ProjectIcon } from '@/components/navigation/TabIcons';
import { EmptyStateCard, ScreenScaffold } from '@/components/ui/ScreenScaffold';
import { Colors, Spacing, Typography } from '@/constants/BambuTheme';

export default function ActiveProjectScreen() {
  return (
    <ScreenScaffold
      title="Active Project"
      subtitle={
        <View style={styles.status}>
          <View style={styles.dot} />
          <Text style={styles.statusText}>Idle</Text>
        </View>
      }
    >
      <EmptyStateCard
        icon={<ProjectIcon focused color={Colors.accentPrimary} size={30} />}
        title="No project on the hook"
        body="Start a project to track rows and stitches, and capture Snapchat-style progress stories."
      />
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs + 2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.textSecondary,
  },
  statusText: {
    ...Typography.callout,
    color: Colors.textSecondary,
  },
});
