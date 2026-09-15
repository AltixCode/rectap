import {
  GAMES_BETWEEN_INTERSTITIALS,
  MIN_GAMES_BEFORE_FIRST_INTERSTITIAL,
  MIN_MS_BETWEEN_INTERSTITIALS,
  shouldShowInterstitial,
  type InterstitialContext,
} from '../adPolicy';
import { shouldShowAds } from '../entitlements';

const base: InterstitialContext = {
  gamesPlayed: GAMES_BETWEEN_INTERSTITIALS,
  lastInterstitialAt: 0,
  now: MIN_MS_BETWEEN_INTERSTITIALS * 10,
  adsRemoved: false,
};

describe('shouldShowInterstitial', () => {
  it('shows on the cadence boundary once the cooldown has elapsed', () => {
    expect(shouldShowInterstitial(base)).toBe(true);
  });

  it('never shows to a user who paid to remove ads', () => {
    expect(shouldShowInterstitial({ ...base, adsRemoved: true })).toBe(false);
  });

  it('stays silent through the first sessions', () => {
    for (let played = 0; played <= MIN_GAMES_BEFORE_FIRST_INTERSTITIAL; played += 1) {
      expect(shouldShowInterstitial({ ...base, gamesPlayed: played })).toBe(false);
    }
  });

  it('stays silent off the cadence boundary', () => {
    expect(shouldShowInterstitial({ ...base, gamesPlayed: GAMES_BETWEEN_INTERSTITIALS + 1 })).toBe(false);
  });

  it('respects the minimum gap between two interstitials', () => {
    const now = MIN_MS_BETWEEN_INTERSTITIALS * 10;
    expect(
      shouldShowInterstitial({ ...base, now, lastInterstitialAt: now - MIN_MS_BETWEEN_INTERSTITIALS + 1 }),
    ).toBe(false);
    expect(
      shouldShowInterstitial({ ...base, now, lastInterstitialAt: now - MIN_MS_BETWEEN_INTERSTITIALS }),
    ).toBe(true);
  });

  it('stays silent when the device clock moved backwards', () => {
    expect(shouldShowInterstitial({ ...base, lastInterstitialAt: base.now + 60_000 })).toBe(false);
  });

  it.each([NaN, Infinity])('stays silent for a corrupt games-played count (%p)', (value) => {
    expect(shouldShowInterstitial({ ...base, gamesPlayed: value })).toBe(false);
  });
});

/**
 * Capture mode, and the guard that makes it safe to exist at all.
 *
 * It suppresses ad slots so a store screenshot cannot contain someone else's
 * advert. The danger of such a flag is obvious -- a build that ships with ads
 * silently disabled earns nothing -- so the test that matters is not that it
 * works, but that it CANNOT work in a release build.
 */
describe('capture mode', () => {
  const realDev = (globalThis as { __DEV__?: boolean }).__DEV__;
  afterEach(() => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = realDev;
    delete process.env.EXPO_PUBLIC_CAPTURE_MODE;
  });

  it('hides ads for a capture build', () => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = true;
    process.env.EXPO_PUBLIC_CAPTURE_MODE = '1';
    expect(shouldShowAds({ isPremium: false, isReady: true })).toBe(false);
  });

  it('is inert in a release build even when the flag is set', () => {
    // The whole safety argument. __DEV__ is false in anything that ships.
    (globalThis as { __DEV__?: boolean }).__DEV__ = false;
    process.env.EXPO_PUBLIC_CAPTURE_MODE = '1';
    expect(shouldShowAds({ isPremium: false, isReady: true })).toBe(true);
  });

  it('leaves ordinary debug behaviour alone when the flag is absent', () => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = true;
    expect(shouldShowAds({ isPremium: false, isReady: true })).toBe(true);
  });
});
