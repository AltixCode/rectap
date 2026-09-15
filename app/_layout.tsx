import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { I18nManager } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { isRTLLanguage, t } from '@/i18n';
import { bootstrapAds } from '@/monetization/ads';
import { shouldShowAds } from '@/monetization/entitlements';
import { preloadInterstitial } from '@/monetization/interstitial';
import { usePremiumStore } from '@/store/usePremiumStore';
import { ThemeProvider, useTheme } from '@/theme';

void SplashScreen.preventAutoHideAsync();

// Arabic and Persian must actually mirror the layout, not merely translate. This
// runs at module scope because React Native reads the flag when the first view
// is laid out — setting it from an effect leaves the first frame LTR.
I18nManager.allowRTL(true);
I18nManager.forceRTL(isRTLLanguage());

function RootNavigator() {
  const { colors, isDark } = useTheme();
  const isPremium = usePremiumStore((s) => s.isPremium);
  const isReady = usePremiumStore((s) => s.isReady);
  const initialize = usePremiumStore((s) => s.initialize);

  useEffect(() => {
    void initialize();
    void SplashScreen.hideAsync();
  }, [initialize]);

  useEffect(() => {
    // Ads bootstrap (and the iOS tracking prompt) is deferred until we know the user is not
    // premium — a paying user is never shown a tracking prompt for ads they will never see.
    if (!shouldShowAds({ isPremium, isReady })) return;
    void bootstrapAds().then(() => preloadInterstitial());
  }, [isPremium, isReady]);

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShadowVisible: false,
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: '600' },
          contentStyle: { backgroundColor: colors.background },
          headerBackButtonDisplayMode: 'minimal',
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ title: t('settingsTitle') }} />
        <Stack.Screen
          name="paywall"
          options={{ title: '', presentation: 'modal', headerShown: false }}
        />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <RootNavigator />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
