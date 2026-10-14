import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { Platform, StyleSheet } from 'react-native';

import { CollectToastHost } from '@/components/CollectToast';
import { LaunchSplash } from '@/components/LaunchSplash';
import { BambuTabBar } from '@/components/navigation/BambuTabBar';
import { MeIcon, PatternsIcon, ProjectIcon } from '@/components/navigation/TabIcons';
import { Colors } from '@/constants/BambuTheme';
import { useAuthGateReady } from '@/hooks/useAuthGateReady';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';
import { useCrochetStore } from '@/store/useCrochetStore';

/**
 * Primary navigation — mirrors Bambu Handy's Models / Devices / Me tabs.
 *
 * Phones (any platform) get the bottom bar. On wider windows (desktop web,
 * tablets) the same navigator moves to the left as a rail/sidebar and the
 * scene is constrained to a centered, readable column.
 */
export default function TabLayout() {
  const { navPosition, contentMaxWidth } = useResponsiveLayout();
  const gateReady = useAuthGateReady();
  const account = useCrochetStore((state) => state.account);

  if (!gateReady) {
    return <LaunchSplash />;
  }

  if (!account) {
    return <Redirect href="/welcome" />;
  }

  return (
    <>
    <Tabs
      tabBar={(props) => <BambuTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarPosition: navPosition,
        // Bambu switches tabs instantly; a quick cross-fade feels native without lag.
        animation: Platform.OS === 'web' ? 'none' : 'fade',
        sceneStyle: [styles.scene, contentMaxWidth !== undefined && { maxWidth: contentMaxWidth }],
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Patterns',
          tabBarIcon: ({ focused, color, size }) => <PatternsIcon focused={focused} color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="active"
        options={{
          title: 'Active Project',
          tabBarIcon: ({ focused, color, size }) => <ProjectIcon focused={focused} color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="me"
        options={{
          title: 'Me',
          tabBarIcon: ({ focused, color, size }) => <MeIcon focused={focused} color={color} size={size} />,
        }}
      />
    </Tabs>
    <CollectToastHost />
    </>
  );
}

const styles = StyleSheet.create({
  scene: {
    flex: 1,
    width: '100%',
    alignSelf: 'center',
    backgroundColor: Colors.backgroundPrimary,
  },
});
