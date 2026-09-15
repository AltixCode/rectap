import {
  LIFETIME_PACKAGE,
  PRO_ENTITLEMENT,
  isLifetimePlan,
  selectLifetime,
  shouldShowAds,
  type PlanLike,
} from '../entitlements';

const lifetime: PlanLike = { identifier: '$rc_lifetime', priceString: '$3.99', price: 3.99, periodUnit: null };
const yearly: PlanLike = { identifier: '$rc_annual', priceString: '$9.99', price: 9.99, periodUnit: 'YEAR' };
const monthly: PlanLike = { identifier: '$rc_monthly', priceString: '$1.99', price: 1.99, periodUnit: 'MONTH' };

describe('identifiers', () => {
  it('matches the entitlement configured in RevenueCat', () => {
    // Renaming an entitlement means recreating it, which invalidates the public
    // SDK keys — so this constant is pinned by a test on purpose.
    expect(PRO_ENTITLEMENT).toBe('remove_ads');
  });

  it('matches the package identifier the SDK exposes as offerings.current.lifetime', () => {
    expect(LIFETIME_PACKAGE).toBe('$rc_lifetime');
  });
});

describe('shouldShowAds', () => {
  it('shows ads to a resolved free user', () => {
    expect(shouldShowAds({ isPremium: false, isReady: true })).toBe(true);
  });

  it('never shows ads to a premium user', () => {
    expect(shouldShowAds({ isPremium: true, isReady: true })).toBe(false);
  });

  it('shows nothing while entitlements are still resolving', () => {
    // The damaging case: a paying user cold-starting would otherwise see one ad frame.
    expect(shouldShowAds({ isPremium: false, isReady: false })).toBe(false);
    expect(shouldShowAds({ isPremium: true, isReady: false })).toBe(false);
  });
});

describe('isLifetimePlan', () => {
  it('accepts the one non-consumable this portfolio sells', () => {
    expect(isLifetimePlan(lifetime)).toBe(true);
  });

  it.each([
    ['a yearly subscription', yearly],
    ['a monthly subscription', monthly],
  ])('rejects %s — the portfolio never sells subscriptions', (_label, plan) => {
    expect(isLifetimePlan(plan)).toBe(false);
  });

  it('rejects a non-consumable whose identifier is not the lifetime package', () => {
    expect(isLifetimePlan({ ...lifetime, identifier: 'coin_pack_small' })).toBe(false);
  });

  it('rejects a lifetime-named product that still carries a billing period', () => {
    // Belt and braces: a mis-configured store product must not render as a one-off.
    expect(isLifetimePlan({ ...lifetime, periodUnit: 'YEAR' })).toBe(false);
  });
});

describe('selectLifetime', () => {
  it('picks the lifetime package out of a mixed offering', () => {
    expect(selectLifetime([monthly, lifetime, yearly])).toBe(lifetime);
  });

  it('returns null rather than falling back to a subscription', () => {
    expect(selectLifetime([monthly, yearly])).toBeNull();
  });

  it('returns null for an empty offering', () => {
    expect(selectLifetime([])).toBeNull();
  });
});
