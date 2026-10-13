import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Layout, Radius, Spacing, Typography } from '@/constants/BambuTheme';

type ScreenScaffoldProps = {
  title: string;
  subtitle?: ReactNode;
  children?: ReactNode;
};

/** Safe-area aware, scrollable screen shell with a Bambu-style header. */
export function ScreenScaffold({ title, subtitle, children }: ScreenScaffoldProps) {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.md }]}
      contentInsetAdjustmentBehavior="never"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text role="heading" aria-level={1} style={styles.title}>
          {title}
        </Text>
        {typeof subtitle === 'string' ? <Text style={styles.subtitle}>{subtitle}</Text> : subtitle}
      </View>
      {children}
    </ScrollView>
  );
}

type EmptyStateCardProps = {
  icon: ReactNode;
  title: string;
  body: string;
};

/** Placeholder card for sections that are scaffolded but not yet built. */
export function EmptyStateCard({ icon, title, body }: EmptyStateCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.iconWell}>{icon}</View>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardBody}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: Colors.backgroundPrimary,
  },
  content: {
    paddingHorizontal: Layout.screenGutter,
    paddingBottom: Spacing.xxxl,
    gap: Layout.cardGap,
  },
  header: {
    gap: Spacing.xxs,
    marginBottom: Spacing.sm,
  },
  title: {
    ...Typography.title,
    color: Colors.textPrimary,
  },
  subtitle: {
    ...Typography.callout,
    color: Colors.textSecondary,
  },
  card: {
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.huge,
    paddingHorizontal: Spacing.xxl,
    borderRadius: Radius.md,
    backgroundColor: Colors.cardSurface,
  },
  iconWell: {
    width: 64,
    height: 64,
    marginBottom: Spacing.sm,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.elevatedControl,
  },
  cardTitle: {
    ...Typography.subhead,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  cardBody: {
    ...Typography.callout,
    color: Colors.textSecondary,
    textAlign: 'center',
    maxWidth: 360,
  },
});
