import {
  GAMES_BETWEEN_INTERSTITIALS,
  MIN_GAMES_BEFORE_FIRST_INTERSTITIAL,
  MIN_MS_BETWEEN_INTERSTITIALS,
  shouldShowInterstitial,
  type InterstitialContext,
} from '../adPolicy';

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
