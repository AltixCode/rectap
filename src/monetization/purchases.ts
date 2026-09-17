import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type PurchasesOffering,
  type PurchasesPackage,
} from 'react-native-purchases';

import { PRO_ENTITLEMENT, isCaptureMode, selectLifetime, type PlanLike } from './entitlements';
import { isPurchasesConfigured, revenueCatApiKey } from './config';

/**
 * RevenueCat wrapper.
 *
 * Everything the app calls goes through here so that:
 *  - a build with no RevenueCat key (a fresh clone, a CI smoke build) still
 *    runs, simply reporting "not premium" rather than crashing at launch;
 *  - entitlement checking lives in exactly one place.
 */

let configured = false;

export async function configurePurchases(): Promise<void> {
  if (configured || !isPurchasesConfigured || !revenueCatApiKey) return;
  if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.WARN);
  await Purchases.configure({ apiKey: revenueCatApiKey });
  configured = true;
}

/** True when the customer holds the `pro` entitlement. */
export function hasProEntitlement(info: CustomerInfo | null | undefined): boolean {
  if (!info) return false;
  return info.entitlements.active[PRO_ENTITLEMENT] !== undefined;
}

export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  if (!configured) return null;
  try {
    return await Purchases.getCustomerInfo();
  } catch {
    // Offline or a transient RevenueCat outage. The cached entitlement in the
    // store stays authoritative; we never downgrade a paying user on an error.
    return null;
  }
}

export async function getCurrentOffering(): Promise<PurchasesOffering | null> {
  if (!configured) return null;
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current ?? null;
  } catch {
    return null;
  }
}

/** Adapts a RevenueCat package to the pure `PlanLike` shape the UI reasons about. */
export function toPlanLike(pkg: PurchasesPackage): PlanLike {
  return {
    identifier: pkg.identifier,
    priceString: pkg.product.priceString,
    price: pkg.product.price,
    periodUnit: pkg.product.subscriptionPeriod
      ? periodUnitOf(pkg.product.subscriptionPeriod)
      : null,
  };
}

/** Parses an ISO-8601 duration such as `P1Y` / `P1M` into a unit token. */
function periodUnitOf(period: string): string | null {
  if (/Y$/.test(period)) return 'YEAR';
  if (/M$/.test(period)) return 'MONTH';
  if (/W$/.test(period)) return 'WEEK';
  if (/D$/.test(period)) return 'DAY';
  return null;
}

/**
 * The one lifetime package this app sells, or null.
 *
 * Returning a single package rather than a list is deliberate: it makes a subscription that
 * somehow reached the offering unrenderable instead of merely discouraged.
 */
/**
 * The package a store screenshot shows when the simulator has no store.
 *
 * A StoreKit configuration cannot reach this pipeline. Xcode applies one by
 * syncing it to the device as part of running a scheme --
 * `-[DVTDevice handleStoreKitConfigurationSyncForBundleID:configurationFilePath:]`
 * -- and `xcrun simctl` has no equivalent, so an `expo run:ios` plus
 * `simctl launch` build never receives a product catalogue however correct its
 * .storekit file is. The paywall then renders its unavailable state, and the
 * IAP review screenshot Apple sees says "The store is not reachable right now"
 * where the buy button belongs. Several live ones do.
 *
 * So capture mode supplies the price from the build instead. The figure comes
 * from `scripts/iap.json`, which is read out of the App Store Connect price
 * schedule, so the screenshot states this product's real cost -- it simply
 * learns it from the bundle rather than from StoreKit.
 *
 * `__DEV__` is what makes this safe: it is false in every release build, so
 * this is inert in anything that ships no matter how the environment is set.
 */
function capturePriceFallback(): PurchasesPackage | null {
  const price = process.env.EXPO_PUBLIC_CAPTURE_PRICE;
  if (!isCaptureMode() || !price) return null;
  const amount = Number(price.replace(/[^0-9.]/g, '')) || 0;
  // Shaped like a package for display only. Nothing purchases it: a capture
  // route is forbidden from tapping a purchase button, and a release build
  // never reaches this line.
  return {
    identifier: 'lifetime',
    packageType: 'LIFETIME',
    offeringIdentifier: 'capture',
    product: {
      identifier: 'capture.lifetime',
      priceString: price.startsWith('$') ? price : `$${price}`,
      price: amount,
      currencyCode: 'USD',
    },
  } as unknown as PurchasesPackage;
}

export function lifetimePackage(offering: PurchasesOffering | null): PurchasesPackage | null {
  if (!offering) return capturePriceFallback();
  const byId = new Map(offering.availablePackages.map((p) => [p.identifier, p]));
  const plan = selectLifetime(offering.availablePackages.map(toPlanLike));
  return plan ? (byId.get(plan.identifier) ?? null) : capturePriceFallback();
}

export interface PurchaseResult {
  status: 'purchased' | 'cancelled' | 'error';
  isPremium: boolean;
  message?: string;
}

export async function purchasePackage(pkg: PurchasesPackage): Promise<PurchaseResult> {
  if (!configured) {
    return { status: 'error', isPremium: false, message: 'Purchases are unavailable.' };
  }
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return { status: 'purchased', isPremium: hasProEntitlement(customerInfo) };
  } catch (error) {
    const e = error as { userCancelled?: boolean; message?: string };
    if (e.userCancelled) return { status: 'cancelled', isPremium: false };
    return {
      status: 'error',
      isPremium: false,
      message: e.message ?? 'Something went wrong. Please try again.',
    };
  }
}

/**
 * Restores previous purchases.
 *
 * App Review explicitly tests this path on a fresh install; a missing or broken
 * restore is one of the most common rejection reasons for a paid app.
 */
export async function restorePurchases(): Promise<PurchaseResult> {
  if (!configured) {
    return { status: 'error', isPremium: false, message: 'Purchases are unavailable.' };
  }
  try {
    const customerInfo = await Purchases.restorePurchases();
    return { status: 'purchased', isPremium: hasProEntitlement(customerInfo) };
  } catch (error) {
    const e = error as { message?: string };
    return {
      status: 'error',
      isPremium: false,
      message: e.message ?? 'Could not restore purchases.',
    };
  }
}

export function addCustomerInfoListener(
  listener: (info: CustomerInfo) => void,
): () => void {
  if (!configured) return () => {};
  Purchases.addCustomerInfoUpdateListener(listener);
  return () => Purchases.removeCustomerInfoUpdateListener(listener);
}
