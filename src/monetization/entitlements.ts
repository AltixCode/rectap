/**
 * Pure freemium rules.
 *
 * Deliberately free of RevenueCat types and native calls so the gating that decides whether a
 * user sees a paywall or an ad can be unit tested exhaustively — this is the code most likely
 * to cost money or a store rejection if it is wrong.
 */

/**
 * The single entitlement one purchase grants.
 *
 * The lookup key says "remove ads" because that is what the store product is named and what a
 * free user actually feels, but the entitlement carries the whole upgrade: no ads *and* no
 * free-tier limits. Renaming an entitlement in RevenueCat means recreating it, and the public
 * SDK keys die with it — so this constant is pinned by a test.
 */
export const PRO_ENTITLEMENT = 'remove_ads';

/**
 * The one package the offering is allowed to contain.
 *
 * Every app in this portfolio sells exactly one non-consumable and never a subscription. A
 * second package reaching the paywall is a configuration mistake, not a feature.
 */
export const LIFETIME_PACKAGE = '$rc_lifetime';

export type PaywallReason = 'levels' | 'remove-ads' | 'archive' | 'hints' | 'generic';

/**
 * Ads are shown only once we positively know the user is NOT premium. Rendering ads while
 * entitlements are still loading would flash an ad at a paying user on every cold start — the
 * single most damaging bug this feature can have.
 */
export function shouldShowAds({ isPremium, isReady }: { isPremium: boolean; isReady: boolean }): boolean {
  return isReady && !isPremium;
}

/** The subset of a RevenueCat package the UI actually needs. */
export interface PlanLike {
  identifier: string;
  priceString: string;
  price: number;
  /** `MONTH` | `YEAR` | `WEEK` | `DAY`, or null for a non-subscription. */
  periodUnit: string | null;
}

/**
 * True for the one product this app is allowed to sell.
 *
 * A subscription reaching the paywall would be a portfolio-wide policy break, so it is
 * rejected here rather than rendered — the paywall shows its "store unavailable" state
 * instead, which is honest and cannot charge anyone the wrong thing.
 */
export function isLifetimePlan(plan: PlanLike): boolean {
  return plan.periodUnit === null && /lifetime/i.test(plan.identifier);
}

/** The lifetime plan from an offering, or null when the offering does not carry one. */
export function selectLifetime(plans: readonly PlanLike[]): PlanLike | null {
  return plans.find(isLifetimePlan) ?? null;
}
