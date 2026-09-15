import mobileAds, {
  AdsConsent,
  AdsConsentDebugGeography,
  MaxAdContentRating,
} from 'react-native-google-mobile-ads';
import { Platform } from 'react-native';
import {
  getTrackingPermissionsAsync,
  requestTrackingPermissionsAsync,
} from 'expo-tracking-transparency';

import {
  summariseConsent,
  type ConsentInfoLike,
  type ConsentSummary,
} from '@/monetization/consentPolicy';
import { useAdsConsentStore } from '@/store/useAdsConsentStore';

/**
 * Google Mobile Ads bootstrap.
 *
 * Order matters on iOS: App Tracking Transparency must be requested BEFORE the
 * ads SDK initialises, otherwise the first ad request goes out non-personalised
 * regardless of what the user then chooses. We also never prompt on a cold
 * first frame — the caller defers this until the user has seen the app once.
 */

let initialised = false;
let consent: ConsentSummary = { canServeAds: false, offerPrivacyOptions: false };

function applyConsent(next: ConsentSummary): void {
  consent = next;
  // Published to the store as well so the banner re-renders when consent resolves.
  useAdsConsentStore.getState().setConsent(next);
  if (__DEV__) console.log('[ads] consent', JSON.stringify(next));
}

/** The consent state the last UMP call reported. */
export function getConsentSummary(): ConsentSummary {
  return consent;
}

/**
 * Runs Google's User Messaging Platform flow: fetches the consent state and, where the user's
 * region requires it, presents the form.
 *
 * This has to complete before the Mobile Ads SDK is initialised. Without it the first ad
 * request can go out with no consent recorded at all, which in the EEA and the regulated US
 * states is a policy breach and a common cause of AdMob account suspension -- and it is
 * invisible in testing, because ads keep serving perfectly well until the suspension arrives.
 */
async function gatherConsent(): Promise<ConsentSummary> {
  try {
    // In development the geography is forced so both paths can be exercised on a simulator:
    // EEA makes the form appear every launch, OTHER skips it. Release builds pass no options
    // and let the SDK decide from the real location.
    const options = __DEV__
      ? { debugGeography: AdsConsentDebugGeography.OTHER, testDeviceIdentifiers: [] }
      : undefined;
    const info = (await AdsConsent.gatherConsent(options)) as unknown as ConsentInfoLike;
    return summariseConsent(info);
  } catch {
    // Fail closed: no consent information means no ads, and the app works regardless.
    return { canServeAds: false, offerPrivacyOptions: false };
  }
}

/** Reopens the consent form. Google requires this entry point wherever it reports REQUIRED. */
export async function showPrivacyOptionsForm(): Promise<boolean> {
  try {
    const info = (await AdsConsent.showPrivacyOptionsForm()) as unknown as ConsentInfoLike;
    applyConsent(summariseConsent(info));
    return true;
  } catch {
    return false;
  }
}

/** Requests ATT on iOS. Returns true when the user granted tracking. */
export async function requestTrackingPermission(): Promise<boolean> {
  if (Platform.OS !== 'ios') return true;
  try {
    const current = await getTrackingPermissionsAsync();
    if (!current.canAskAgain) return current.granted;
    const result = await requestTrackingPermissionsAsync();
    return result.granted;
  } catch {
    return false;
  }
}

export async function initializeAds(): Promise<void> {
  if (initialised) return;
  initialised = true;
  try {
    applyConsent(await gatherConsent());
    if (!consent.canServeAds) {
      // Nothing is initialised and no banner renders. The flag stays set so the form is not
      // presented again on every screen that asks for an ad.
      return;
    }
    await mobileAds().setRequestConfiguration({
      // The app is rated 4+ but is not directed at children; G-rated ad content
      // keeps it comfortably inside both stores' rating policies.
      maxAdContentRating: MaxAdContentRating.G,
      tagForChildDirectedTreatment: false,
      tagForUnderAgeOfConsent: false,
    });
    await mobileAds().initialize();
  } catch {
    // A failed ads init must never block the app. Banners simply do not render.
    initialised = false;
  }
}

/**
 * Full ad bootstrap for a non-premium user: ask for tracking, then initialise.
 * Safe to call more than once.
 */
export async function bootstrapAds(): Promise<void> {
  // Order matters: UMP consent first, then ATT, then the SDK. `initializeAds` gathers consent
  // itself, so ATT sits between the two -- a tracking prompt shown before the user has agreed
  // to ads at all is both worse UX and the wrong order for Google's own guidance.
  await requestTrackingPermission();
  await initializeAds();
}
