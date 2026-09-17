import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useColorScheme, useWindowDimensions } from 'react-native';

import {
  TABLET_MIN_WIDTH,
  darkPalette,
  elevation,
  lightPalette,
  motion,
  radius,
  scaleSpacing,
  scaleTypography,
  spacing,
  typography,
  type Palette,
  type ScaledSpacing,
  type ScaledTypography,
} from './tokens';

export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'rectap.theme-preference';

export interface Theme {
  colors: Palette;
  spacing: ScaledSpacing;
  radius: typeof radius;
  typography: ScaledTypography;
  motion: typeof motion;
  elevation: typeof elevation;
  isDark: boolean;
}

interface ThemeContextValue extends Theme {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function buildTheme(isDark: boolean, isTablet: boolean): Theme {
  return {
    colors: isDark ? darkPalette : lightPalette,
    spacing: scaleSpacing(isTablet),
    radius,
    typography: scaleTypography(isTablet),
    motion,
    elevation,
    isDark,
  };
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const { width } = useWindowDimensions();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (cancelled) return;
        if (stored === 'light' || stored === 'dark' || stored === 'system') {
          setPreferenceState(stored);
        }
      })
      .catch(() => {
        // A missing or unreadable preference simply means "follow the system".
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    void AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }, []);

  const isDark = preference === 'system' ? systemScheme === 'dark' : preference === 'dark';

  const value = useMemo<ThemeContextValue>(
    () => ({ ...buildTheme(isDark, width >= TABLET_MIN_WIDTH), preference, setPreference }),
    [isDark, width, preference, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside a <ThemeProvider>.');
  return value;
}
