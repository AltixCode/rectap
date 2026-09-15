import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CustomerInfo, PurchasesPackage } from 'react-native-purchases';

import { usePremiumStore } from '../usePremiumStore';
import * as purchases from '@/monetization/purchases';

jest.mock('@/monetization/purchases');
jest.mock('@/monetization/config', () => ({
  ...jest.requireActual('@/monetization/config'),
  isPurchasesConfigured: true,
}));

const mocked = purchases as jest.Mocked<typeof purchases>;
const CACHE_KEY = 'rectap.entitlement.remove_ads';

const somePackage = { identifier: '$rc_lifetime' } as unknown as PurchasesPackage;

function reset() {
  usePremiumStore.setState({
    isPremium: false,
    isReady: false,
    lifetime: null,
    isPurchasing: false,
    error: null,
  });
}

beforeEach(async () => {
  reset();
  await AsyncStorage.clear();
  jest.clearAllMocks();
  mocked.configurePurchases.mockResolvedValue(undefined);
  mocked.getCustomerInfo.mockResolvedValue(null);
  mocked.hasProEntitlement.mockReturnValue(false);
  mocked.getCurrentOffering.mockResolvedValue(null);
  mocked.lifetimePackage.mockReturnValue(null);
  mocked.addCustomerInfoListener.mockReturnValue(() => {});
});

describe('initialize', () => {
  it('resolves a free user as ready so ads can serve', async () => {
    await usePremiumStore.getState().initialize();
    expect(usePremiumStore.getState()).toMatchObject({ isPremium: false, isReady: true });
  });

  it('restores a cached entitlement before the network answers', async () => {
    // Without this a paying user launching offline is briefly treated as free — and shown an ad.
    await AsyncStorage.setItem(CACHE_KEY, '1');
    await usePremiumStore.getState().initialize();
    expect(usePremiumStore.getState().isPremium).toBe(true);
  });

  it('caches the entitlement RevenueCat reports', async () => {
    mocked.hasProEntitlement.mockReturnValue(true);
    await usePremiumStore.getState().initialize();
    expect(usePremiumStore.getState().isPremium).toBe(true);
    await expect(AsyncStorage.getItem(CACHE_KEY)).resolves.toBe('1');
  });

  it('never downgrades a cached premium user when the network says nothing', async () => {
    await AsyncStorage.setItem(CACHE_KEY, '1');
    mocked.hasProEntitlement.mockReturnValue(false);
    await usePremiumStore.getState().initialize();
    expect(usePremiumStore.getState().isPremium).toBe(true);
  });

  it('subscribes to entitlement changes and applies them', async () => {
    const listeners: ((info: CustomerInfo) => void)[] = [];
    mocked.addCustomerInfoListener.mockImplementation((listener) => {
      listeners.push(listener);
      return () => {};
    });
    await usePremiumStore.getState().initialize();
    mocked.hasProEntitlement.mockReturnValue(true);
    listeners.forEach((notify) => notify({} as CustomerInfo));
    expect(usePremiumStore.getState().isPremium).toBe(true);
  });

  it('still becomes ready when configuring purchases throws', async () => {
    // A store that never becomes ready shows no ads and no paywall — it just earns nothing.
    mocked.configurePurchases.mockRejectedValueOnce(new Error('boom'));
    await usePremiumStore.getState().initialize();
    expect(usePremiumStore.getState()).toMatchObject({ isReady: true, error: 'boom' });
  });
});

describe('initialize without billing configured', () => {
  it('runs as a free ad-supported app rather than hanging at "loading"', async () => {
    // A device with no Play services, a fresh clone, a CI smoke build. This used to leave
    // `isReady` false, which reads as "still loading" forever: no banner, no revenue, on
    // exactly the devices where billing is unavailable.
    let store!: typeof usePremiumStore;
    jest.isolateModules(() => {
      jest.doMock('@/monetization/config', () => ({
        ...jest.requireActual('@/monetization/config'),
        isPurchasesConfigured: false,
      }));
      // `require`, not a dynamic `import`: Jest's CommonJS runtime cannot resolve
      // an ESM import callback without --experimental-vm-modules.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      store = require('../usePremiumStore').usePremiumStore;
    });
    await store.getState().initialize();
    expect(store.getState()).toMatchObject({ isReady: true, isPremium: false });
  });
});

describe('purchase', () => {
  it('applies and caches a successful purchase', async () => {
    mocked.purchasePackage.mockResolvedValueOnce({ status: 'purchased', isPremium: true });
    await expect(usePremiumStore.getState().purchase(somePackage)).resolves.toBe('purchased');
    expect(usePremiumStore.getState()).toMatchObject({ isPremium: true, isPurchasing: false });
    await expect(AsyncStorage.getItem(CACHE_KEY)).resolves.toBe('1');
  });

  it('leaves a cancelled purchase with no error to explain away', async () => {
    mocked.purchasePackage.mockResolvedValueOnce({ status: 'cancelled', isPremium: false });
    await expect(usePremiumStore.getState().purchase(somePackage)).resolves.toBe('cancelled');
    expect(usePremiumStore.getState().error).toBeNull();
  });

  it('surfaces a failed purchase', async () => {
    mocked.purchasePackage.mockResolvedValueOnce({ status: 'error', isPremium: false, message: 'declined' });
    await expect(usePremiumStore.getState().purchase(somePackage)).resolves.toBe('error');
    expect(usePremiumStore.getState().error).toBe('declined');
  });
});

describe('restore', () => {
  it('reports a restored entitlement', async () => {
    mocked.restorePurchases.mockResolvedValueOnce({ status: 'purchased', isPremium: true });
    await expect(usePremiumStore.getState().restore()).resolves.toBe('purchased');
    expect(usePremiumStore.getState().isPremium).toBe(true);
  });

  it('distinguishes "nothing to restore" from a failure', async () => {
    mocked.restorePurchases.mockResolvedValueOnce({ status: 'purchased', isPremium: false });
    await expect(usePremiumStore.getState().restore()).resolves.toBe('none');
  });

  it('reports a failure without clearing an existing entitlement', async () => {
    usePremiumStore.setState({ isPremium: true });
    mocked.restorePurchases.mockResolvedValueOnce({ status: 'error', isPremium: false, message: 'offline' });
    await expect(usePremiumStore.getState().restore()).resolves.toBe('error');
    expect(usePremiumStore.getState()).toMatchObject({ isPremium: true, error: 'offline' });
  });
});

describe('refreshOfferings', () => {
  it('stores the single lifetime package', async () => {
    mocked.lifetimePackage.mockReturnValue(somePackage);
    await usePremiumStore.getState().refreshOfferings();
    expect(usePremiumStore.getState().lifetime).toBe(somePackage);
  });

  it('leaves the paywall with nothing to sell when the offering carries no lifetime', async () => {
    mocked.lifetimePackage.mockReturnValue(null);
    await usePremiumStore.getState().refreshOfferings();
    expect(usePremiumStore.getState().lifetime).toBeNull();
  });
});

describe('clearError', () => {
  it('clears a surfaced error', () => {
    usePremiumStore.setState({ error: 'x' });
    usePremiumStore.getState().clearError();
    expect(usePremiumStore.getState().error).toBeNull();
  });
});
