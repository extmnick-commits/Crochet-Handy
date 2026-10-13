/**
 * BambuTabBar — one navigator UI, three window-size presentations.
 *
 *  compact  → Bambu Handy bottom bar (hairline top border, icon over label)
 *  medium   → Material-style icon rail with an accent pill behind the icon
 *  expanded → labelled desktop sidebar with brand header
 *
 * The navigator places this component on the left/bottom via `tabBarPosition`
 * (see app/(tabs)/_layout.tsx); this component only decides how it looks.
 */
import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { BrandMark } from '@/components/brand/BrandMark';
import { Colors, Layout, Motion, Radius, Spacing, Typography } from '@/constants/BambuTheme';
import { useResponsiveLayout, type LayoutMode } from '@/hooks/useResponsiveLayout';

type TabItemModel = {
  key: string;
  label: string;
  focused: boolean;
  testID: string;
  renderIcon: (color: string, size: number) => ReactNode;
  onPress: () => void;
  onLongPress: () => void;
};

const IS_WEB = Platform.OS === 'web';

export function BambuTabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  const { mode } = useResponsiveLayout();

  const items: TabItemModel[] = state.routes.flatMap((route, index) => {
    const { options } = descriptors[route.key];

    // Respect Expo Router's `href: null` (hidden tab) convention.
    if (StyleSheet.flatten(options.tabBarItemStyle)?.display === 'none') return [];

    const focused = state.index === index;
    const label =
      typeof options.tabBarLabel === 'string' ? options.tabBarLabel : (options.title ?? route.name);

    return [
      {
        key: route.key,
        label,
        focused,
        testID: options.tabBarButtonTestID ?? `tab-${route.name}`,
        renderIcon: (color, size) => options.tabBarIcon?.({ focused, color, size }) ?? null,
        onPress: () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) {
            if (!IS_WEB) void Haptics.selectionAsync();
            navigation.navigate(route.name, route.params);
          }
        },
        onLongPress: () => navigation.emit({ type: 'tabLongPress', target: route.key }),
      },
    ];
  });

  if (mode === 'compact') {
    return (
      <View
        role="tablist"
        style={[
          styles.bottomBar,
          {
            paddingBottom: Math.max(insets.bottom, Spacing.xs),
            paddingLeft: insets.left,
            paddingRight: insets.right,
          },
        ]}
      >
        {items.map((item) => (
          <TabButton key={item.key} item={item} variant="compact" />
        ))}
      </View>
    );
  }

  const isExpanded = mode === 'expanded';

  return (
    <View
      role="tablist"
      style={[
        isExpanded ? styles.sidebar : styles.rail,
        { paddingTop: insets.top + Spacing.xl, paddingBottom: insets.bottom + Spacing.lg, paddingLeft: insets.left },
      ]}
    >
      <View style={isExpanded ? styles.sidebarBrand : styles.railBrand}>
        <BrandMark size={isExpanded ? 36 : 40} />
        {isExpanded && (
          <View>
            <Text style={styles.brandTitle}>Crochet Handy</Text>
            <Text style={styles.brandSubtitle}>Make. Track. Share.</Text>
          </View>
        )}
      </View>

      <View style={isExpanded ? styles.sidebarItems : styles.railItems}>
        {items.map((item) => (
          <TabButton key={item.key} item={item} variant={mode} />
        ))}
      </View>

      {isExpanded && (
        <Text style={styles.sidebarFooter}>v{Constants.expoConfig?.version ?? '1.0.0'}</Text>
      )}
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/*                                 Tab button                                 */
/* -------------------------------------------------------------------------- */

function TabButton({ item, variant }: { item: TabItemModel; variant: LayoutMode }) {
  const [hovered, setHovered] = useState(false);
  const { focused } = item;

  const iconColor = focused ? Colors.accentPrimary : hovered ? Colors.textPrimary : Colors.textSecondary;
  const labelColor = focused || hovered ? Colors.textPrimary : Colors.textSecondary;

  const icon = <IconPop focused={focused}>{item.renderIcon(iconColor, variant === 'expanded' ? 24 : Layout.tabIconSize)}</IconPop>;

  return (
    <Pressable
      role="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={item.label}
      testID={item.testID}
      onPress={item.onPress}
      onLongPress={item.onLongPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      android_ripple={variant === 'compact' ? { color: Colors.accentMuted, borderless: true, radius: 40 } : undefined}
      style={({ pressed }) => [
        variant === 'compact' && styles.compactItem,
        variant === 'medium' && styles.railItem,
        variant === 'expanded' && [
          styles.sidebarItem,
          hovered && styles.sidebarItemHovered,
          focused && styles.sidebarItemActive,
        ],
        pressed && Platform.OS === 'ios' && styles.pressed,
        IS_WEB && styles.webCursor,
      ]}
    >
      {variant === 'compact' && (
        <>
          {icon}
          <Text numberOfLines={1} style={[styles.compactLabel, { color: labelColor }]}>
            {item.label}
          </Text>
        </>
      )}

      {variant === 'medium' && (
        <>
          <View style={[styles.railPill, (focused || hovered) && styles.railPillHovered, focused && styles.railPillActive]}>
            {icon}
          </View>
          <Text numberOfLines={2} style={[styles.railLabel, { color: labelColor }]}>
            {item.label}
          </Text>
        </>
      )}

      {variant === 'expanded' && (
        <>
          <View style={[styles.sidebarIndicator, focused && styles.sidebarIndicatorActive]} />
          {icon}
          <Text numberOfLines={1} style={[styles.sidebarLabel, { color: labelColor }]}>
            {item.label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

/** Springy "pop" when a tab becomes active — a small, Bambu-subtle micro-interaction. */
function IconPop({ focused, children }: { focused: boolean; children: ReactNode }) {
  const [scale] = useState(() => new Animated.Value(1));
  const wasFocused = useRef(focused);

  useEffect(() => {
    const becameFocused = focused && !wasFocused.current;
    wasFocused.current = focused;
    if (!becameFocused) return;
    scale.setValue(0.82);
    Animated.spring(scale, { toValue: 1, ...Motion.spring, useNativeDriver: !IS_WEB }).start();
  }, [focused, scale]);

  return <Animated.View style={{ transform: [{ scale }] }}>{children}</Animated.View>;
}

/* -------------------------------------------------------------------------- */
/*                                   Styles                                   */
/* -------------------------------------------------------------------------- */

const styles = StyleSheet.create({
  /* compact — bottom bar */
  bottomBar: {
    flexDirection: 'row',
    backgroundColor: Colors.cardSurface,
    borderTopWidth: Layout.hairline,
    borderTopColor: Colors.border,
  },
  compactItem: {
    flex: 1,
    height: Layout.tabBarHeight,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  compactLabel: {
    ...Typography.tab,
  },

  /* medium — rail */
  rail: {
    width: Layout.railWidth,
    alignItems: 'center',
    backgroundColor: Colors.backgroundPrimary,
    borderRightWidth: Layout.hairline,
    borderRightColor: Colors.border,
  },
  railBrand: {
    marginBottom: Spacing.xxl,
  },
  railItems: {
    gap: Spacing.lg,
    alignItems: 'center',
  },
  railItem: {
    width: Layout.railWidth,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  railPill: {
    width: 56,
    height: 34,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  railPillHovered: {
    backgroundColor: Colors.elevatedControl,
  },
  railPillActive: {
    backgroundColor: Colors.accentMuted,
  },
  railLabel: {
    ...Typography.tab,
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: Spacing.xs,
  },

  /* expanded — sidebar */
  sidebar: {
    width: Layout.sidebarWidth,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.backgroundPrimary,
    borderRightWidth: Layout.hairline,
    borderRightColor: Colors.border,
  },
  sidebarBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.sm,
    marginBottom: Spacing.xxxl,
  },
  brandTitle: {
    ...Typography.subhead,
    color: Colors.textPrimary,
  },
  brandSubtitle: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  sidebarItems: {
    flex: 1,
    gap: Spacing.xs,
  },
  sidebarItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    height: 48,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  sidebarItemHovered: {
    backgroundColor: Colors.cardSurface,
  },
  sidebarItemActive: {
    backgroundColor: Colors.elevatedControl,
  },
  sidebarIndicator: {
    position: 'absolute',
    left: 0,
    top: 12,
    bottom: 12,
    width: 3,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
    backgroundColor: Colors.transparent,
  },
  sidebarIndicatorActive: {
    backgroundColor: Colors.accentPrimary,
  },
  sidebarLabel: {
    ...Typography.label,
  },
  sidebarFooter: {
    ...Typography.caption,
    color: Colors.textTertiary,
    paddingHorizontal: Spacing.sm,
  },

  /* shared */
  pressed: {
    opacity: 0.6,
  },
  webCursor: {
    cursor: 'pointer',
  },
});
