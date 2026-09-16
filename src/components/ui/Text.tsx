import React from 'react';
import {
  Text as RNText,
  useWindowDimensions,
  type TextProps as RNTextProps,
  type TextStyle,
} from 'react-native';

import { useTheme } from '@/theme';
import type { typography } from '@/theme/tokens';

type Variant = keyof typeof typography;
type Tone = 'default' | 'muted' | 'faint' | 'accent' | 'danger' | 'inverse';

export interface TextProps extends RNTextProps {
  variant?: Variant;
  tone?: Tone;
  /** Overrides `tone` when a habit's own accent should be used. */
  color?: string;
  align?: TextStyle['textAlign'];
}

/**
 * The only text component in the app. Going through one component is what keeps
 * the type scale honest — no ad-hoc `fontSize: 15` appears anywhere else.
 */
export function Text({
  variant = 'body',
  tone = 'default',
  color,
  align,
  style,
  ...rest
}: TextProps) {
  const { colors, typography: scale } = useTheme();
  const { width } = useWindowDimensions();

  // Type scales up on a tablet.
  //
  // The scale is tuned for a phone held at about 30cm. The same 13pt caption on
  // a 13" iPad is read from further away on a much larger surface, and Ata's
  // note on seeing one was that the text and controls were simply too small to
  // read. Points are density independent, so nothing was shrinking -- the
  // surface grew and the type did not.
  //
  // One multiplier rather than a second hand-tuned scale: the ratios between
  // display, body and caption are already right, and re-deriving them per
  // device would drift from the phone scale for no reason.
  const isTablet = width >= 700;
  const base = scale[variant] as TextStyle;
  const sized: TextStyle = isTablet
    ? {
        ...base,
        fontSize: base.fontSize === undefined ? undefined : Math.round(base.fontSize * 1.25),
        lineHeight: base.lineHeight === undefined ? undefined : Math.round(base.lineHeight * 1.25),
      }
    : base;

  const toneColor: Record<Tone, string> = {
    default: colors.text,
    muted: colors.textMuted,
    faint: colors.textFaint,
    accent: colors.accent,
    danger: colors.danger,
    inverse: colors.onInverse,
  };

  return (
    <RNText
      style={[
        sized,
        { color: color ?? toneColor[tone] },
        align ? { textAlign: align } : null,
        style,
      ]}
      // Respect the user's text-size setting, but stop runaway scaling from
      // breaking the grid layout.
      maxFontSizeMultiplier={1.6}
      {...rest}
    />
  );
}
