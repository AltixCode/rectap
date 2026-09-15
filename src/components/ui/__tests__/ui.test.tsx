import { fireEvent } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { Text as RNText } from 'react-native';

import { renderWithProviders } from '@/components/__tests__/renderWithProviders';
import { Button, Card, IconButton, Screen, Text } from '..';

describe('Text', () => {
  it('renders its content', async () => {
    const { getByText } = await renderWithProviders(<Text>Hello</Text>);
    expect(getByText('Hello')).toBeTruthy();
  });

  it('caps font scaling so a large accessibility size cannot break the grid', async () => {
    const { getByText } = await renderWithProviders(<Text>Hello</Text>);
    expect(getByText('Hello').props.maxFontSizeMultiplier).toBe(1.6);
  });

  it.each(['default', 'muted', 'faint', 'accent', 'danger', 'inverse'] as const)(
    'renders the %s tone',
    async (tone) => {
      const { getByText } = await renderWithProviders(<Text tone={tone}>Tone</Text>);
      expect(getByText('Tone')).toBeTruthy();
    },
  );

  it('lets an explicit colour override the tone', async () => {
    const { getByText } = await renderWithProviders(
      <Text tone="muted" color="#FF0000" align="center">
        Tinted
      </Text>,
    );
    expect(getByText('Tinted')).toBeTruthy();
  });
});

describe('Button', () => {
  it('calls onPress and fires haptic feedback', async () => {
    const onPress = jest.fn();
    const { getByText } = await renderWithProviders(<Button label="Go" onPress={onPress} />);
    await fireEvent.press(getByText('Go'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(Haptics.impactAsync).toHaveBeenCalled();
  });

  it('does not fire while disabled', async () => {
    const onPress = jest.fn();
    const { getByText } = await renderWithProviders(<Button label="Go" disabled onPress={onPress} />);
    await fireEvent.press(getByText('Go'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('swallows the press while loading and announces itself as busy', async () => {
    const onPress = jest.fn();
    const { getByLabelText } = await renderWithProviders(
      <Button label="Saving" loading onPress={onPress} />,
    );
    const button = getByLabelText('Saving');
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
    expect(button.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
  });

  it.each(['primary', 'secondary', 'ghost', 'danger'] as const)('renders the %s variant', async (variant) => {
    const { getByText } = await renderWithProviders(<Button label="V" variant={variant} />);
    expect(getByText('V')).toBeTruthy();
  });

  it.each(['sm', 'md', 'lg'] as const)('renders at size %s', async (size) => {
    const { getByText } = await renderWithProviders(<Button label="S" size={size} />);
    expect(getByText('S')).toBeTruthy();
  });

  it('renders an icon on either side and accepts a tint', async () => {
    const { getByText } = await renderWithProviders(
      <>
        <Button label="Left" icon="check" />
        <Button label="Right" icon="check" iconPosition="right" tint="#7C5CFF" fullWidth />
      </>,
    );
    expect(getByText('Left')).toBeTruthy();
    expect(getByText('Right')).toBeTruthy();
  });
});

describe('IconButton', () => {
  it('requires and exposes an accessible label', async () => {
    const onPress = jest.fn();
    const { getByLabelText } = await renderWithProviders(
      <IconButton icon="x" accessibilityLabel="Close" onPress={onPress} />,
    );
    await fireEvent.press(getByLabelText('Close'));
    expect(onPress).toHaveBeenCalled();
    expect(Haptics.selectionAsync).toHaveBeenCalled();
  });

  it('announces itself as disabled rather than silently ignoring the tap', async () => {
    const onPress = jest.fn();
    const { getByLabelText } = await renderWithProviders(
      <IconButton icon="x" accessibilityLabel="Close" disabled onPress={onPress} />,
    );
    const button = getByLabelText('Close');
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
    expect(button.props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('accepts a custom size and colour', async () => {
    const { getByLabelText } = await renderWithProviders(
      <IconButton icon="star" accessibilityLabel="Star" size={28} color="#FF0000" />,
    );
    expect(getByLabelText('Star')).toBeTruthy();
  });
});

describe('Card', () => {
  it('renders children, padded or not', async () => {
    const { getByText } = await renderWithProviders(
      <>
        <Card>
          <RNText>Padded</RNText>
        </Card>
        <Card padded={false}>
          <RNText>Bare</RNText>
        </Card>
      </>,
    );
    expect(getByText('Padded')).toBeTruthy();
    expect(getByText('Bare')).toBeTruthy();
  });
});

describe('Screen', () => {
  it('renders as a plain view by default', async () => {
    const { getByText } = await renderWithProviders(
      <Screen>
        <RNText>Static</RNText>
      </Screen>,
    );
    expect(getByText('Static')).toBeTruthy();
  });

  it('renders scrollable, unpadded, and clearing a banner inset', async () => {
    const { getByText } = await renderWithProviders(
      <Screen scroll padded={false} bottomInset={60}>
        <RNText>Scrolling</RNText>
      </Screen>,
    );
    expect(getByText('Scrolling')).toBeTruthy();
  });
});
