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

  const isTablet = width >= 700;

  // Do NOT centre the content vertically on a tablet.
  //
  // `justifyContent: 'center'` only has slack when the content is shorter than
  // the viewport -- which on a 13" iPad is most screens. The result is a phone's
  // worth of interface floating in the middle of a large display with dead space
  // above and below it, which is exactly what Ata described on seeing one:
  // "one iphone app streched on sitting in the middle with lots of empty space".
  // Content starts at the top, like every other screen the reader has used.
  const fill = null;

  // The column widens on a tablet instead of staying at the phone measure.
  //
  // 640pt inside 1032pt is a strip down the middle with margins wider than most
  // phones. A reading measure is the right instinct for prose and the wrong one
  // for an interface made of cards, rows and controls, which is what these
  // screens are. The cap still exists so a 13" landscape screen does not run a
  // single row of text the whole way across.
  const column = {
    width: '100%' as const,
    maxWidth: isTablet
      ? Math.min(width - spacing.xl * 2, TABLET_MAX_WIDTH)
      : CONTENT_MAX_WIDTH,
    alignSelf: 'center' as const,
  };

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

/** The widest a content column gets on a phone, in points. Never binds: the
 *  widest phone is 440pt. */
const CONTENT_MAX_WIDTH = 640;

/** The widest it gets on a tablet. 1032pt (13" portrait) less two xl gutters is
 *  984, so this binds only on a landscape 13" and leaves the portrait case using
 *  the screen it is on. */
const TABLET_MAX_WIDTH = 920;

const styles = StyleSheet.create({ flex: { flex: 1 } });
