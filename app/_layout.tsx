import { DarkTheme, Stack, ThemeProvider, type Theme } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { Platform } from 'react-native';

import { Colors } from '@/constants/BambuTheme';

// Surface Expo Router's error screen instead of a blank app on render errors.
export { ErrorBoundary } from 'expo-router';

/**
 * Paint the native root view (and `document.body` on web) with the canvas
 * color so there's never a white flash during launch, rotation, or transitions.
 */
void SystemUI.setBackgroundColorAsync(Colors.backgroundPrimary);

/** React Navigation theme derived from Bambu tokens (headers, cards, borders). */
const NavigationTheme: Theme = {
  ...DarkTheme,
  dark: true,
  colors: {
    ...DarkTheme.colors,
    primary: Colors.accentPrimary,
    background: Colors.backgroundPrimary,
    card: Colors.cardSurface,
    text: Colors.textPrimary,
    border: Colors.border,
    notification: Colors.accentPrimary,
  },
};

if (Platform.OS === 'web') injectWebGlobalStyles();

export default function RootLayout() {
  return (
    <ThemeProvider value={NavigationTheme}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Colors.backgroundPrimary },
          animation: Platform.OS === 'android' ? 'fade_from_bottom' : 'default',
        }}
      >
        <Stack.Screen name="(tabs)" />
      </Stack>
    </ThemeProvider>
  );
}

/**
 * Small set of document-level styles that can't be expressed with RN styles:
 * dark scrollbars, no rubber-band overscroll, no tap flash, crisp text.
 */
function injectWebGlobalStyles() {
  if (typeof document === 'undefined' || document.getElementById('bambu-global')) return;

  const style = document.createElement('style');
  style.id = 'bambu-global';
  style.textContent = `
    :root { color-scheme: dark; }
    html, body, #root { background-color: ${Colors.backgroundPrimary}; height: 100%; }
    body {
      overscroll-behavior: none;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      -webkit-tap-highlight-color: transparent;
    }
    * { scrollbar-width: thin; scrollbar-color: ${Colors.elevatedControl} transparent; }
    ::selection { background: ${Colors.accentMuted}; }
    :focus-visible { outline: 2px solid ${Colors.accentPrimary}; outline-offset: 2px; }
  `;
  document.head.appendChild(style);
}
