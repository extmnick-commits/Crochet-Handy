import { Redirect } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';

import { LaunchSplash } from '@/components/LaunchSplash';
import { WelcomeAuthScreen } from '@/components/WelcomeAuthScreen';
import { Colors } from '@/constants/BambuTheme';
import { useAuthGateReady } from '@/hooks/useAuthGateReady';
import { useCrochetStore } from '@/store/useCrochetStore';

export default function WelcomeScreen() {
  const gateReady = useAuthGateReady();
  const account = useCrochetStore((state) => state.account);

  if (!gateReady) {
    return <LaunchSplash />;
  }

  if (account) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <View style={styles.screen}>
      <WelcomeAuthScreen />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    width: '100%',
    backgroundColor: Platform.OS === 'web' ? Colors.transparent : Colors.backgroundPrimary,
  },
});
