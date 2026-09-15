import React, { type ReactNode } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type ScrollViewProps,
} from 'react-native';
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
  const { width } = useWindowDimensions();

  // On a tablet the capped column leaves most of the display empty below the
  // content, which reads as a phone screen pinned to the top of a big one.
  // Centring it costs nothing when the content is taller than the viewport,
  // because flexGrow only has slack to distribute when there is slack.
  const isTablet = width >= 700;
  const fill = isTablet ? { flexGrow: 1, justifyContent: 'center' as const } : null;

  // A tablet is not a big phone. Left to fill, a row of body text runs the
  // whole 13" width and the eye loses the start of the next line; the measure
  // below is the same one a reading column uses, centred, with the scroll view
  // itself still full-bleed so the scrollbar stays at the edge.
  const column = { width: '100%' as const, maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' as const };

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
      <View style={[styles.flex, { backgroundColor: colors.background }, style]}>
        <View style={[styles.flex, padding, column, fill]}>{children}</View>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.flex, { backgroundColor: colors.background }, style]}
      contentContainerStyle={[padding, column, fill, contentContainerStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      {...rest}
    >
      {children}
    </ScrollView>
  );
}

/** The widest a content column gets, in points. Below this nothing changes. */
const CONTENT_MAX_WIDTH = 640;

const styles = StyleSheet.create({ flex: { flex: 1 } });
