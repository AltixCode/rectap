import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type PurchasesOffering,
  type PurchasesPackage,
} from 'react-native-purchases';

import { PRO_ENTITLEMENT, selectLifetime, type PlanLike } from './entitlements';
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
export function lifetimePackage(offering: PurchasesOffering | null): PurchasesPackage | null {
  if (!offering) return null;
  const byId = new Map(offering.availablePackages.map((p) => [p.identifier, p]));
  const plan = selectLifetime(offering.availablePackages.map(toPlanLike));
  return plan ? (byId.get(plan.identifier) ?? null) : null;
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
