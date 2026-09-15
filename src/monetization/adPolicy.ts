/**
 * Interstitial pacing. Deliberately conservative: over-serving interstitials is the fastest way
 * to tank Day-1 retention, which is what the whole UA model depends on.
 */
export const GAMES_BETWEEN_INTERSTITIALS = 3;
export const MIN_GAMES_BEFORE_FIRST_INTERSTITIAL = 2;
export const MIN_MS_BETWEEN_INTERSTITIALS = 90_000;

export interface InterstitialContext {
  /** Completed runs, including the one that just ended. */
  gamesPlayed: number;
  lastInterstitialAt: number;
  now: number;
  adsRemoved: boolean;
}

export function shouldShowInterstitial({
  gamesPlayed,
  lastInterstitialAt,
  now,
  adsRemoved,
}: InterstitialContext): boolean {
  if (adsRemoved) return false;
  if (!Number.isFinite(gamesPlayed) || gamesPlayed <= MIN_GAMES_BEFORE_FIRST_INTERSTITIAL) {
    return false;
  }
  if (gamesPlayed % GAMES_BETWEEN_INTERSTITIALS !== 0) return false;

  const elapsed = now - lastInterstitialAt;
  // A negative elapsed time means the device clock moved backwards — stay quiet rather than
  // showing an ad the cadence did not earn.
  if (elapsed < MIN_MS_BETWEEN_INTERSTITIALS) return false;

  return true;
}
