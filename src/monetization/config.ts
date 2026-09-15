import { Platform } from 'react-native';

/**
 * Runtime monetization configuration, resolved from the environment.
 *
 * No key is hardcoded. RevenueCat *public* SDK keys and AdMob ad-unit ids are client-side
 * identifiers by nature (they ship inside the binary), which is why they carry the
 * `EXPO_PUBLIC_` prefix — but they differ per environment, so they are injected, not committed.
 */

/** Google's documented test ad units. These never serve live inventory. */
const TEST_BANNER_IOS = 'ca-app-pub-3940256099942544/2934735716';
const TEST_BANNER_ANDROID = 'ca-app-pub-3940256099942544/6300978111';
const TEST_INTERSTITIAL_IOS = 'ca-app-pub-3940256099942544/4411468910';
const TEST_INTERSTITIAL_ANDROID = 'ca-app-pub-3940256099942544/1033173712';
const TEST_REWARDED_IOS = 'ca-app-pub-3940256099942544/1712485313';
const TEST_REWARDED_ANDROID = 'ca-app-pub-3940256099942544/5224354917';

function pick(ios: string | undefined, android: string | undefined): string | undefined {
  return Platform.OS === 'ios' ? ios : android;
}

/**
 * Resolves a live ad unit, falling back to Google's test unit whenever one is not configured
 * or we are in a debug build — requesting live ads from a development build is an AdMob policy
 * violation that can suspend the whole account.
 */
function adUnit(ios: string | undefined, android: string | undefined, testIos: string, testAndroid: string): string {
  const live = !__DEV__ ? pick(ios, android) : undefined;
  if (live && live.trim().length > 0) return live;
  return Platform.OS === 'ios' ? testIos : testAndroid;
}

export const revenueCatApiKey: string | undefined = pick(
  process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
  process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
);

/** True when purchases can actually be configured on this build. */
export const isPurchasesConfigured = Boolean(revenueCatApiKey);

export const bannerAdUnitId = adUnit(
  process.env.EXPO_PUBLIC_ADMOB_IOS_BANNER_ID,
  process.env.EXPO_PUBLIC_ADMOB_ANDROID_BANNER_ID,
  TEST_BANNER_IOS,
  TEST_BANNER_ANDROID,
);

export const interstitialAdUnitId = adUnit(
  process.env.EXPO_PUBLIC_ADMOB_IOS_INTERSTITIAL_ID,
  process.env.EXPO_PUBLIC_ADMOB_ANDROID_INTERSTITIAL_ID,
  TEST_INTERSTITIAL_IOS,
  TEST_INTERSTITIAL_ANDROID,
);

export const rewardedAdUnitId = adUnit(
  process.env.EXPO_PUBLIC_ADMOB_IOS_REWARDED_ID,
  process.env.EXPO_PUBLIC_ADMOB_ANDROID_REWARDED_ID,
  TEST_REWARDED_IOS,
  TEST_REWARDED_ANDROID,
);

export const SUPPORT_EMAIL = 'info@altixcode.com';
export const PRIVACY_POLICY_URL = 'https://altixcode.com/legal/app-privacy';
export const TERMS_URL = 'https://altixcode.com/legal/terms';
