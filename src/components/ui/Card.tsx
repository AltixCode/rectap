import React, { type ReactNode } from 'react';
import { StyleSheet, View, type ViewProps, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

export interface CardProps extends ViewProps {
  children: ReactNode;
  padded?: boolean;
  style?: ViewStyle | ViewStyle[];
}

/** A raised surface. One hairline border, one soft shadow — nothing louder. */
export function Card({ children, padded = true, style, ...rest }: CardProps) {
  const { colors, radius, spacing, elevation } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          padding: padded ? spacing.base : 0,
        },
        elevation.card,
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}
