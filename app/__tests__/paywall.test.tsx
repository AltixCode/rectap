import { fireEvent, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Linking } from 'react-native';
import type { PurchasesPackage } from 'react-native-purchases';

import Paywall from '../paywall';
import { testRouter } from './testRouter';
import { renderWithProviders } from '@/components/__tests__/renderWithProviders';
import { t } from '@/i18n';
import { usePremiumStore } from '@/store/usePremiumStore';

const LIFETIME = {
  identifier: '$rc_lifetime',
  product: { priceString: '$3.99', price: 3.99, subscriptionPeriod: null },
} as unknown as PurchasesPackage;

function seed(over: Record<string, unknown> = {}) {
  usePremiumStore.setState({
    isPremium: false,
    isReady: true,
    lifetime: null,
    isPurchasing: false,
    error: null,
    refreshOfferings: jest.fn().mockResolvedValue(undefined),
    purchase: jest.fn().mockResolvedValue('purchased'),
    restore: jest.fn().mockResolvedValue('none'),
    ...over,
  } as never);
}

beforeEach(() => {
  jest.clearAllMocks();
  seed();
});

// No `jest.restoreAllMocks()` here. It restores every spy in the process, not
// only this file's — including ones the renderer itself relies on — and the
// next test's tree then renders and is immediately torn down, which surfaces as
// "unable to find an element" on a screen that plainly renders it in isolation.
// `jest.clearAllMocks()` in beforeEach resets call counts, and each test that
// needs a spy installs its own.

describe('Paywall', () => {
  it('waits for the price rather than showing a button that cannot be priced', async () => {
    const { getByText, queryByText } = await renderWithProviders(<Paywall />);
    expect(getByText(t('loadingPrice'))).toBeTruthy();
    expect(queryByText(t('lifetimeAccess', { price: '$3.99' }))).toBeNull();
  });

  it('offers exactly one purchase, priced, and buys it on tap', async () => {
    const purchase = jest.fn().mockResolvedValue('purchased');
    seed({ lifetime: LIFETIME, purchase });
    const { getByText } = await renderWithProviders(<Paywall />);
    await fireEvent.press(getByText(t('lifetimeAccess', { price: '$3.99' })));
    expect(purchase).toHaveBeenCalledWith(LIFETIME);
  });

  it('states the purchase is one-time — the portfolio never sells subscriptions', async () => {
    seed({ lifetime: LIFETIME });
    const { getByText } = await renderWithProviders(<Paywall />);
    expect(getByText(t('oneTimePayment'))).toBeTruthy();
    expect(getByText(t('antiSubHeadline'))).toBeTruthy();
  });

  it('lists what the purchase unlocks', async () => {
    const { getByText } = await renderWithProviders(<Paywall />);
    expect(getByText(t('feat1Title'))).toBeTruthy();
    expect(getByText(t('feat1Desc'))).toBeTruthy();
  });

  // Asserting on `feat4Desc` here would encode the template's shape rather than
  // this app's claims, and would fail against any honest rewrite that has
  // fewer than four things to say. What matters is that a blank claim is not
  // rendered as an empty row.
  it('renders no row for a claim this app does not make', async () => {
    const { queryByText } = await renderWithProviders(<Paywall />);
    expect(queryByText('')).toBeNull();
  });

  it('closes itself for a user who already owns it', async () => {
    seed({ isPremium: true });
    await renderWithProviders(<Paywall />);
    await waitFor(() => expect(testRouter.back).toHaveBeenCalled());
  });

  it('surfaces a purchase error', async () => {
    seed({ lifetime: LIFETIME, error: t('purchaseFailed') });
    const { getByText } = await renderWithProviders(<Paywall />);
    expect(getByText(t('purchaseFailed'))).toBeTruthy();
  });

  it('offers restore — App Review tests this path on a fresh install', async () => {
    const restore = jest.fn().mockResolvedValue('none');
    seed({ restore });
    const { getByText } = await renderWithProviders(<Paywall />);
    await fireEvent.press(getByText(t('restorePurchases')));
    expect(restore).toHaveBeenCalled();
  });

  it('closes on the close control', async () => {
    const { getByLabelText } = await renderWithProviders(<Paywall />);
    await fireEvent.press(getByLabelText(t('close')));
    expect(testRouter.back).toHaveBeenCalled();
  });

  it('links to terms and privacy, which both stores require on a paywall', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const { getByLabelText } = await renderWithProviders(<Paywall />);
    await fireEvent.press(getByLabelText(t('termsOfUse')));
    await fireEvent.press(getByLabelText(t('privacyPolicy')));
    // Awaited for the same reason as the settings link test: an unsettled
    // promise from the previous test unmounts the next one's tree.
    await waitFor(() => expect(open).toHaveBeenCalledTimes(2));
  });

  it('discloses that ads are what make the app free', async () => {
    const { getByText } = await renderWithProviders(<Paywall />);
    expect(getByText(t('adsDisclosure'))).toBeTruthy();
  });
});

describe('when the store has nothing to sell', () => {
  it('says the store is unreachable rather than spinning forever', async () => {
    usePremiumStore.setState({ lifetime: null, offeringsResolved: true, isPremium: false, isReady: true });
    const { getByText, queryByText } = await renderWithProviders(<Paywall />);
    expect(getByText(t('storeUnavailable'))).toBeTruthy();
    expect(queryByText(t('loadingPrice'))).toBeNull();
  });

  it('still offers Restore, so a user who already paid is not stranded', async () => {
    usePremiumStore.setState({ lifetime: null, offeringsResolved: true, isPremium: false, isReady: true });
    const { getByText } = await renderWithProviders(<Paywall />);
    expect(getByText(t('restorePurchases'))).toBeTruthy();
  });

  it('shows the spinner only while the lookup is genuinely still running', async () => {
    usePremiumStore.setState({ lifetime: null, offeringsResolved: false, isPremium: false, isReady: true });
    const { getByText, queryByText } = await renderWithProviders(<Paywall />);
    expect(getByText(t('loadingPrice'))).toBeTruthy();
    expect(queryByText(t('storeUnavailable'))).toBeNull();
  });
});

