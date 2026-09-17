/**
 * The capture-mode price fallback.
 *
 * It exists because a StoreKit configuration cannot reach an
 * `expo run:ios` + `simctl launch` pipeline, so the paywall renders its
 * unavailable state and the IAP review screenshot Apple sees reads
 * "The store is not reachable right now" where the buy button belongs.
 *
 * The only property that really matters here is the last one: that this is
 * invisible outside a capture build. It fabricates a package, and a fabricated
 * package must never be able to reach a real user.
 */
import { lifetimePackage } from '../purchases';

const ORIGINAL = process.env.EXPO_PUBLIC_CAPTURE_PRICE;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.EXPO_PUBLIC_CAPTURE_PRICE;
  else process.env.EXPO_PUBLIC_CAPTURE_PRICE = ORIGINAL;
  (globalThis as { __DEV__?: boolean }).__DEV__ = true;
  delete process.env.EXPO_PUBLIC_CAPTURE_MODE;
});

function captureBuild(price: string | undefined) {
  (globalThis as { __DEV__?: boolean }).__DEV__ = true;
  process.env.EXPO_PUBLIC_CAPTURE_MODE = '1';
  if (price === undefined) delete process.env.EXPO_PUBLIC_CAPTURE_PRICE;
  else process.env.EXPO_PUBLIC_CAPTURE_PRICE = price;
}

describe('capture-mode price fallback', () => {
  it('supplies a package with a price when the store gave us nothing', () => {
    captureBuild('3.99');
    const pkg = lifetimePackage(null);
    expect(pkg).not.toBeNull();
    expect(pkg!.product.priceString).toBe('$3.99');
    expect(pkg!.product.price).toBeCloseTo(3.99);
  });

  it('does not double the currency mark when one is already there', () => {
    captureBuild('$7.99');
    expect(lifetimePackage(null)!.product.priceString).toBe('$7.99');
  });

  it('stays null when capture mode is on but no price was supplied', () => {
    captureBuild(undefined);
    // Better a paywall with no price than one quoting a number nobody set.
    expect(lifetimePackage(null)).toBeNull();
  });

  it('stays null in a normal debug build, capture mode off', () => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = true;
    delete process.env.EXPO_PUBLIC_CAPTURE_MODE;
    process.env.EXPO_PUBLIC_CAPTURE_PRICE = '3.99';
    expect(lifetimePackage(null)).toBeNull();
  });

  it('stays null in a release build even with both set', () => {
    // The one that matters. __DEV__ is false in anything that ships, so a
    // fabricated price cannot reach a paying user however the environment is
    // configured.
    (globalThis as { __DEV__?: boolean }).__DEV__ = false;
    process.env.EXPO_PUBLIC_CAPTURE_MODE = '1';
    process.env.EXPO_PUBLIC_CAPTURE_PRICE = '3.99';
    expect(lifetimePackage(null)).toBeNull();
  });
});
