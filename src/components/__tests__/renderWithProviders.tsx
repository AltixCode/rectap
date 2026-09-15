import { render, type RenderOptions } from '@testing-library/react-native';
import React, { type ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider } from '@/theme';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

/**
 * Renders inside the providers every screen relies on.
 * `render` is asynchronous in React Native Testing Library 14 — always await it.
 */
export function renderWithProviders(ui: ReactElement, options?: RenderOptions) {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>{ui}</ThemeProvider>
    </SafeAreaProvider>,
    options,
  );
}
