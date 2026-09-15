import { act } from '@testing-library/react-native';
import React from 'react';

import { useAdsConsentStore } from '@/store/useAdsConsentStore';
import { usePremiumStore } from '@/store/usePremiumStore';

import { BannerAdSlot } from '../BannerAdSlot';
import { renderWithProviders } from './renderWithProviders';

describe('BannerAdSlot', () => {
  beforeEach(() => {
    // Consent is the precondition for any ad request; these cases are about entitlement, so
    // they start from a user whose region either needs no form or has already answered one.
    useAdsConsentStore.setState({ consent: { canServeAds: true, offerPrivacyOptions: false } });
  });

  afterEach(async () => {
    await act(async () => {
      usePremiumStore.setState({ isPremium: false, isReady: false });
      useAdsConsentStore.getState().resetForTests();
    });
  });

  it('renders a banner for a free user once entitlements have resolved', async () => {
    usePremiumStore.setState({ isPremium: false, isReady: true });
    const { queryByTestId } = await renderWithProviders(<BannerAdSlot />);
    expect(queryByTestId('banner-ad')).not.toBeNull();
  });

  it('renders nothing for a premium user — the whole point of the upgrade', async () => {
    usePremiumStore.setState({ isPremium: true, isReady: true });
    const { queryByTestId } = await renderWithProviders(<BannerAdSlot />);
    expect(queryByTestId('banner-ad')).toBeNull();
  });

  it('renders nothing while entitlements are still loading, so no ad ever flashes', async () => {
    usePremiumStore.setState({ isPremium: false, isReady: false });
    const { queryByTestId } = await renderWithProviders(<BannerAdSlot />);
    expect(queryByTestId('banner-ad')).toBeNull();
  });

  it('requests no ad until UMP consent permits it', async () => {
    usePremiumStore.setState({ isPremium: false, isReady: true });
    useAdsConsentStore.setState({ consent: { canServeAds: false, offerPrivacyOptions: false } });
    const { queryByTestId } = await renderWithProviders(<BannerAdSlot />);
    expect(queryByTestId('banner-ad')).toBeNull();
  });
});
