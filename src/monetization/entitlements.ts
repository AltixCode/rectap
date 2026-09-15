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
/**
 * Suppresses ad slots while capturing store screenshots.
 *
 * Twenty-three screenshots reached App Store Connect with a Google *test*
 * advert across the bottom -- a third party's creative carrying a literal
 * "Test mode" badge. The cause is a race nobody can win: the banner reserves no
 * space until an advert loads, so capturing early catches the launch screen and
 * capturing late catches the advert.
 *
 * The fix is to stop the slot rendering rather than to time the shutter.
 *
 * `__DEV__` is the guard, and it is what makes this safe: it is false in every
 * release build, so this flag is inert in anything that ships no matter how the
 * environment is set. A capture build is a debug build by definition. It also
 * produces the screenshots a paying customer sees, which is the honest picture
 * of the app regardless.
 */
export function isCaptureMode(): boolean {
  return __DEV__ && process.env.EXPO_PUBLIC_CAPTURE_MODE === '1';
}

export function shouldShowAds({ isPremium, isReady }: { isPremium: boolean; isReady: boolean }): boolean {
  if (isCaptureMode()) return false;
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
