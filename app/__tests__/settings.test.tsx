import { fireEvent, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert, Linking } from 'react-native';

import Settings from '../settings';
import { testRouter } from './testRouter';
import { renderWithProviders } from '@/components/__tests__/renderWithProviders';
import { t } from '@/i18n';
import * as ads from '@/monetization/ads';
import { useAdsConsentStore } from '@/store/useAdsConsentStore';
import { usePremiumStore } from '@/store/usePremiumStore';

jest.mock('@/monetization/ads');

beforeEach(() => {
  jest.clearAllMocks();
  usePremiumStore.setState({
    isPremium: false,
    isReady: true,
    restore: jest.fn().mockResolvedValue('none'),
  });
  useAdsConsentStore.setState({ consent: { canServeAds: true, offerPrivacyOptions: false } });
});

// No `jest.restoreAllMocks()` here. It restores every spy in the process, not
// only this file's — including ones the renderer itself relies on — and the
// next test's tree then renders and is immediately torn down, which surfaces as
// "unable to find an element" on a screen that plainly renders it in isolation.
// `jest.clearAllMocks()` in beforeEach resets call counts, and each test that
// needs a spy installs its own.

describe('Settings', () => {
  it('offers the upgrade to a free user and routes to the paywall', async () => {
    const { getByText } = await renderWithProviders(<Settings />);
    await fireEvent.press(getByText(t('removeAdsCta')));
    expect(testRouter.push).toHaveBeenCalledWith('/paywall');
  });

  it('thanks a premium user instead of selling to them again', async () => {
    usePremiumStore.setState({ isPremium: true });
    const { queryByText, getByText } = await renderWithProviders(<Settings />);
    expect(queryByText(t('removeAdsCta'))).toBeNull();
    expect(getByText(t('proActive'))).toBeTruthy();
  });

  it('reports a successful restore', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const restore = jest.fn().mockResolvedValue('purchased');
    usePremiumStore.setState({ restore });
    const { getByText } = await renderWithProviders(<Settings />);
    await fireEvent.press(getByText(t('restorePurchases')));
    expect(restore).toHaveBeenCalled();
    await waitFor(() => expect(alert).toHaveBeenCalledWith(t('restoredTitle'), t('restoredBody')));
  });

  it('says so plainly when there is nothing to restore', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { getByText } = await renderWithProviders(<Settings />);
    await fireEvent.press(getByText(t('restorePurchases')));
    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith(t('nothingToRestoreTitle'), t('noPriorPurchases')),
    );
  });

  it('hides the ad privacy entry where UMP does not require one', async () => {
    const { queryByText } = await renderWithProviders(<Settings />);
    expect(queryByText(t('privacyOptionsDesc'))).toBeNull();
  });

  it('reopens the consent form where Google requires that entry point', async () => {
    useAdsConsentStore.setState({ consent: { canServeAds: true, offerPrivacyOptions: true } });
    const { getByText } = await renderWithProviders(<Settings />);
    await fireEvent.press(getByText(t('privacyOptionsDesc')));
    expect(ads.showPrivacyOptionsForm).toHaveBeenCalled();
  });

  it('switches the theme preference', async () => {
    const { getByLabelText } = await renderWithProviders(<Settings />);
    const dark = getByLabelText(t('themeDark'));
    await fireEvent.press(dark);
    await waitFor(() => expect(getByLabelText(t('themeDark')).props.accessibilityState.selected).toBe(true));
  });

  it('opens the legal and support links', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const { getByText } = await renderWithProviders(<Settings />);
    await fireEvent.press(getByText(t('privacyPolicy')));
    await fireEvent.press(getByText(t('termsOfUse')));
    await fireEvent.press(getByText(t('contactSupport')));
    // Awaited, not asserted synchronously: `void Linking.openURL(...)` leaves a
    // promise settling after the test ends, and React then reports overlapping
    // act() and tears down the NEXT test's tree.
    await waitFor(() => expect(open).toHaveBeenCalledTimes(3));
    expect(open).toHaveBeenCalledWith(expect.stringContaining('mailto:'));
  });

  it('shows the app version', async () => {
    const { getByText } = await renderWithProviders(<Settings />);
    expect(getByText(t('versionLabel', { version: '1.0.0' }))).toBeTruthy();
  });
});
