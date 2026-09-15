import Purchases from 'react-native-purchases';
import type { CustomerInfo, PurchasesOffering, PurchasesPackage } from 'react-native-purchases';

import {
  addCustomerInfoListener,
  configurePurchases,
  getCurrentOffering,
  getCustomerInfo,
  hasProEntitlement,
  lifetimePackage,
  purchasePackage,
  restorePurchases,
  toPlanLike,
} from '../purchases';
import { PRO_ENTITLEMENT } from '../entitlements';

// The real module reads its key from the environment at import time, so the
// "configured" branch is unreachable unless the config module is stubbed here.
jest.mock('../config', () => ({
  ...jest.requireActual('../config'),
  isPurchasesConfigured: true,
  revenueCatApiKey: 'appl_test_key',
}));

const mockPurchases = Purchases as jest.Mocked<typeof Purchases>;

function pkg(identifier: string, price: number, period: string | null): PurchasesPackage {
  return {
    identifier,
    product: { priceString: `$${price}`, price, subscriptionPeriod: period },
  } as unknown as PurchasesPackage;
}

const info = (active: Record<string, unknown>): CustomerInfo =>
  ({ entitlements: { active } }) as unknown as CustomerInfo;

// The module keeps a `configured` flag that gates every call; every test here
// runs against the configured module.
beforeAll(async () => {
  await configurePurchases();
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('hasProEntitlement', () => {
  it('is true only when the pro entitlement is active', () => {
    expect(hasProEntitlement(info({ [PRO_ENTITLEMENT]: {} }))).toBe(true);
    expect(hasProEntitlement(info({ something_else: {} }))).toBe(false);
  });

  it('treats missing customer info as not entitled', () => {
    expect(hasProEntitlement(null)).toBe(false);
    expect(hasProEntitlement(undefined)).toBe(false);
  });
});

describe('toPlanLike', () => {
  it.each([
    ['P1Y', 'YEAR'],
    ['P1M', 'MONTH'],
    ['P1W', 'WEEK'],
    ['P3D', 'DAY'],
  ])('maps the ISO-8601 period %s to %s', (period, expected) => {
    expect(toPlanLike(pkg('p', 1, period)).periodUnit).toBe(expected);
  });

  it('reports no period for a non-subscription', () => {
    expect(toPlanLike(pkg('$rc_lifetime', 3.99, null)).periodUnit).toBeNull();
  });

  it('reports no period for an unrecognised duration rather than guessing', () => {
    expect(toPlanLike(pkg('p', 1, 'GARBAGE')).periodUnit).toBeNull();
  });
});

describe('lifetimePackage', () => {
  it('picks the lifetime package out of an offering', () => {
    const offering = {
      availablePackages: [pkg('$rc_monthly', 1.99, 'P1M'), pkg('$rc_lifetime', 3.99, null)],
    } as unknown as PurchasesOffering;
    expect(lifetimePackage(offering)?.identifier).toBe('$rc_lifetime');
  });

  it('returns null rather than falling back to a subscription', () => {
    // A subscription reaching the paywall would be a portfolio-wide policy break.
    // Unrenderable beats discouraged.
    const offering = {
      availablePackages: [pkg('$rc_monthly', 1.99, 'P1M')],
    } as unknown as PurchasesOffering;
    expect(lifetimePackage(offering)).toBeNull();
  });

  it('returns null when there is no offering', () => {
    expect(lifetimePackage(null)).toBeNull();
  });
});

describe('getCustomerInfo', () => {
  it('returns what RevenueCat reports', async () => {
    const customer = info({ [PRO_ENTITLEMENT]: {} });
    mockPurchases.getCustomerInfo.mockResolvedValueOnce(customer);
    await expect(getCustomerInfo()).resolves.toBe(customer);
  });

  it('returns null on an outage rather than downgrading a paying user', async () => {
    mockPurchases.getCustomerInfo.mockRejectedValueOnce(new Error('offline'));
    await expect(getCustomerInfo()).resolves.toBeNull();
  });
});

describe('getCurrentOffering', () => {
  it('returns the current offering', async () => {
    const current = { availablePackages: [] } as unknown as PurchasesOffering;
    mockPurchases.getOfferings.mockResolvedValueOnce({ current } as never);
    await expect(getCurrentOffering()).resolves.toBe(current);
  });

  it('returns null when no offering is configured', async () => {
    mockPurchases.getOfferings.mockResolvedValueOnce({ current: null } as never);
    await expect(getCurrentOffering()).resolves.toBeNull();
  });

  it('returns null on failure', async () => {
    mockPurchases.getOfferings.mockRejectedValueOnce(new Error('nope'));
    await expect(getCurrentOffering()).resolves.toBeNull();
  });
});

describe('purchasePackage', () => {
  it('reports the entitlement the purchase granted', async () => {
    mockPurchases.purchasePackage.mockResolvedValueOnce({
      customerInfo: info({ [PRO_ENTITLEMENT]: {} }),
    } as never);
    await expect(purchasePackage(pkg('$rc_lifetime', 3.99, null))).resolves.toEqual({
      status: 'purchased',
      isPremium: true,
    });
  });

  it('treats a user cancellation as neither success nor error', async () => {
    mockPurchases.purchasePackage.mockRejectedValueOnce({ userCancelled: true });
    await expect(purchasePackage(pkg('p', 1, null))).resolves.toEqual({
      status: 'cancelled',
      isPremium: false,
    });
  });

  it('surfaces a real failure with its message', async () => {
    mockPurchases.purchasePackage.mockRejectedValueOnce({ message: 'card declined' });
    await expect(purchasePackage(pkg('p', 1, null))).resolves.toEqual({
      status: 'error',
      isPremium: false,
      message: 'card declined',
    });
  });

  it('falls back to a readable message when the SDK gives none', async () => {
    mockPurchases.purchasePackage.mockRejectedValueOnce({});
    const result = await purchasePackage(pkg('p', 1, null));
    expect(result.status).toBe('error');
    expect(result.message).toBeTruthy();
  });
});

describe('restorePurchases', () => {
  // App Review tests this path on a fresh install; a broken restore is one of the
  // most common rejection reasons for a paid app.
  it('reports the restored entitlement', async () => {
    mockPurchases.restorePurchases.mockResolvedValueOnce(info({ [PRO_ENTITLEMENT]: {} }));
    await expect(restorePurchases()).resolves.toEqual({ status: 'purchased', isPremium: true });
  });

  it('reports no entitlement when there is nothing to restore', async () => {
    mockPurchases.restorePurchases.mockResolvedValueOnce(info({}));
    await expect(restorePurchases()).resolves.toEqual({ status: 'purchased', isPremium: false });
  });

  it('surfaces a failure', async () => {
    mockPurchases.restorePurchases.mockRejectedValueOnce({ message: 'no network' });
    await expect(restorePurchases()).resolves.toEqual({
      status: 'error',
      isPremium: false,
      message: 'no network',
    });
  });
});

describe('addCustomerInfoListener', () => {
  it('registers a listener and removes it on unsubscribe', () => {
    const listener = jest.fn();
    const unsubscribe = addCustomerInfoListener(listener);
    expect(mockPurchases.addCustomerInfoUpdateListener).toHaveBeenCalledWith(listener);
    unsubscribe();
    expect(mockPurchases.removeCustomerInfoUpdateListener).toHaveBeenCalledWith(listener);
  });
});
