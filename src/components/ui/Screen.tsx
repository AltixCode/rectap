import React, { type ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type ScrollViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

interface ScreenProps extends Omit<ScrollViewProps, 'children'> {
  children: ReactNode;
  scroll?: boolean;
  /** Extra bottom padding, e.g. to clear a pinned banner ad. */
  bottomInset?: number;
  padded?: boolean;
  /** Pay the top safe-area inset. Set it on a screen with no navigation header. */
  topInset?: boolean;
}

/**
 * Page shell. Owns the safe-area insets in one place so no screen re-derives
 * them — the notch, the home indicator and Android's gesture bar are handled
 * once, correctly.
 */
export function Screen({
  children,
  scroll = false,
  bottomInset = 0,
  padded = true,
  topInset = false,
  contentContainerStyle,
  style,
  ...rest
}: ScreenProps) {
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();

  const padding = {
    paddingHorizontal: padded ? spacing.base : 0,
    // The top inset is only ours to pay when nothing above us has paid it. A
    // navigation header already sits in the notch, so adding it there would
    // push the content down twice; without a header the first line of text
    // renders *under* the status bar, which is what this fixes.
    paddingTop: topInset ? insets.top : 0,
    paddingBottom: insets.bottom + bottomInset + spacing.xl,
  };

  if (!scroll) {
    return (
      <View style={[styles.flex, { backgroundColor: colors.background }, padding, style]}>
        {children}
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.flex, { backgroundColor: colors.background }, style]}
      contentContainerStyle={[padding, contentContainerStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      {...rest}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 } });
