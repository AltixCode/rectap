import { AdEventType, InterstitialAd } from 'react-native-google-mobile-ads';

import { interstitialAdUnitId } from './config';

/**
 * A single preloaded interstitial.
 *
 * An interstitial that is requested at the moment it should appear either shows nothing (fill
 * takes seconds) or, worse, appears after the user has already moved on. So exactly one is
 * kept warm, shown at most once, and immediately reloaded for next time. Pacing — how often it
 * is *allowed* to appear — is a separate, pure decision in `adPolicy.ts`.
 */

let ad: InterstitialAd | null = null;
let loaded = false;
let unsubscribe: (() => void) | null = null;

export function preloadInterstitial(): void {
  if (ad) return;
  ad = InterstitialAd.createForAdRequest(interstitialAdUnitId, {
    requestNonPersonalizedAdsOnly: false,
  });
  const offLoaded = ad.addAdEventListener(AdEventType.LOADED, () => {
    loaded = true;
  });
  const offClosed = ad.addAdEventListener(AdEventType.CLOSED, () => {
    // The instance is single-use; drop it and warm a fresh one.
    loaded = false;
    reset();
    preloadInterstitial();
  });
  const offError = ad.addAdEventListener(AdEventType.ERROR, () => {
    // No fill or no network. Stay quiet: the caller treats "not shown" as normal.
    loaded = false;
  });
  unsubscribe = () => {
    offLoaded();
    offClosed();
    offError();
  };
  try {
    ad.load();
  } catch {
    reset();
  }
}

export function isInterstitialReady(): boolean {
  return loaded;
}

/** Shows the warm interstitial. Returns false when none was ready, which is not an error. */
export function showInterstitial(): boolean {
  if (!ad || !loaded) {
    preloadInterstitial();
    return false;
  }
  try {
    ad.show();
    return true;
  } catch {
    reset();
    return false;
  }
}

function reset(): void {
  unsubscribe?.();
  unsubscribe = null;
  ad = null;
}

/** Test seam: drops any warm ad and its listeners. */
export function resetInterstitialForTests(): void {
  loaded = false;
  reset();
}
