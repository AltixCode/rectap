import React from 'react';
import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';

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
        scale[variant] as TextStyle,
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
