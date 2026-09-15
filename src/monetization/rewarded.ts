import { RewardedAd, RewardedAdEventType, AdEventType } from 'react-native-google-mobile-ads';

import { rewardedAdUnitId } from './config';

/**
 * Rewarded ads — the opt-in surface (an extra hint, an extra undo).
 *
 * The contract the app cares about is narrow: "the user watched it through and earned the
 * reward", or "they did not". Anything else — no fill, no network, a dismissal partway — is
 * the same outcome: no reward, no error surfaced, the feature simply stays locked.
 */

let ad: RewardedAd | null = null;
let loaded = false;

export function preloadRewarded(): void {
  if (ad) return;
  ad = RewardedAd.createForAdRequest(rewardedAdUnitId, {
    requestNonPersonalizedAdsOnly: false,
  });
  ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
    loaded = true;
  });
  ad.addAdEventListener(AdEventType.ERROR, () => {
    loaded = false;
  });
  try {
    ad.load();
  } catch {
    ad = null;
  }
}

export function isRewardedReady(): boolean {
  return loaded;
}

/** Shows the rewarded ad and resolves true only if the reward was actually earned. */
export function showRewarded(): Promise<boolean> {
  if (!ad || !loaded) {
    preloadRewarded();
    return Promise.resolve(false);
  }
  const instance = ad;
  return new Promise<boolean>((resolve) => {
    let earned = false;
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      loaded = false;
      ad = null;
      preloadRewarded();
      resolve(value);
    };
    instance.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
      earned = true;
    });
    instance.addAdEventListener(AdEventType.CLOSED, () => finish(earned));
    instance.addAdEventListener(AdEventType.ERROR, () => finish(false));
    try {
      instance.show();
    } catch {
      finish(false);
    }
  });
}

/** Test seam. */
export function resetRewardedForTests(): void {
  loaded = false;
  ad = null;
}
