import * as Haptics from 'expo-haptics';
import React, { useCallback } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type ViewStyle,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';

import { MIN_TOUCH_TARGET, readableTextOn, useTheme, withAlpha } from '@/theme';

import { Text } from './Text';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  label: string;
  variant?: Variant;
  size?: Size;
  icon?: keyof typeof Feather.glyphMap;
  iconPosition?: 'left' | 'right';
  loading?: boolean;
  fullWidth?: boolean;
  /** Tints a primary button with a habit's accent colour. */
  tint?: string;
  style?: ViewStyle;
}

const HEIGHTS: Record<Size, number> = { sm: MIN_TOUCH_TARGET, md: 50, lg: 56 };

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  icon,
  iconPosition = 'left',
  loading = false,
  fullWidth = false,
  tint,
  disabled,
  onPress,
  style,
  ...rest
}: ButtonProps) {
  const { colors, radius, spacing } = useTheme();
  const isDisabled = disabled || loading;

  const background =
    variant === 'primary'
      ? (tint ?? colors.inverse)
      : variant === 'danger'
        ? colors.danger
        : variant === 'secondary'
          ? colors.surfaceAlt
          : 'transparent';

  const foreground =
    variant === 'primary'
      ? (tint ? readableTextOn(tint) : colors.onInverse)
      : variant === 'danger'
        ? colors.onDanger
        : colors.text;

  const handlePress = useCallback<NonNullable<PressableProps['onPress']>>(
    (event) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onPress?.(event);
    },
    [onPress],
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={handlePress}
      android_ripple={{ color: withAlpha(foreground, 0.12), borderless: false }}
      style={({ pressed }) => [
        styles.base,
        {
          height: HEIGHTS[size],
          paddingHorizontal: size === 'sm' ? spacing.base : spacing.xl,
          borderRadius: radius.md,
          backgroundColor: background,
          borderWidth: variant === 'ghost' ? StyleSheet.hairlineWidth * 2 : 0,
          borderColor: colors.border,
          opacity: isDisabled ? 0.45 : pressed ? 0.88 : 1,
          transform: [{ scale: pressed && !isDisabled ? 0.985 : 1 }],
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={foreground} />
      ) : (
        <View style={[styles.content, { gap: spacing.sm }]}>
          {icon && iconPosition === 'left' ? (
            <Feather name={icon} size={18} color={foreground} />
          ) : null}
          <Text variant={size === 'lg' ? 'bodyStrong' : 'callout'} color={foreground}>
            {label}
          </Text>
          {icon && iconPosition === 'right' ? (
            <Feather name={icon} size={18} color={foreground} />
          ) : null}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  content: { flexDirection: 'row', alignItems: 'center' },
});
