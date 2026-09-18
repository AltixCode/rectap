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
import { isCaptureMode } from '@/monetization/entitlements';
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
let consentGathered = false;

function applyConsent(next: ConsentSummary): void {
  consent = next;
  consentGathered = true;
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
    // The user may have just opted in for the first time. This is the only path
    // by which consent changes mid-session, so if nothing starts the SDK here
    // nothing ever will -- the banner renders against an uninitialised SDK and
    // silently never fills.
    if (consent.canServeAds) await initializeAds();
    return true;
  } catch {
    return false;
  }
}

/** Requests ATT on iOS. Returns true when the user granted tracking. */
export async function requestTrackingPermission(): Promise<boolean> {
  if (Platform.OS !== 'ios') return true;
  // simctl has no privacy-grant service for ATT (unlike camera/photos/microphone), so this
  // system prompt is otherwise unavoidable during automated screenshot capture -- it covers
  // the app full-screen and discards every frame taken while it's up.
  if (isCaptureMode()) return false;
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
  try {
    // Only gather if nothing has yet -- `bootstrapAds` does it first so that ATT can be
    // ordered after it, and gathering twice re-presents the form.
    if (!consentGathered) applyConsent(await gatherConsent());
    if (!consent.canServeAds) {
      // Nothing is initialised and no banner renders. `initialised` deliberately
      // stays false: a refusal is a decision about consent, not a permanent
      // decision about the SDK, and the user can still opt in through the
      // privacy options form. Re-presenting the form is prevented by
      // `consentGathered`; using `initialised` for that job as well is what
      // left the SDK unstartable for the rest of the session.
      return;
    }
    initialised = true;
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
  // Order matters, and this used to get it backwards: it asked for tracking first and
  // gathered UMP consent second, so on a real device the ATT alert appeared *stacked on top
  // of* the still-open consent form. Two modals at once, and the tracking decision made
  // before the user had been told what the ads are.
  //
  // The order now is consent, then ATT, then the SDK:
  //
  //   - consent first because it is what decides whether there will be ads at all, and
  //     Google's own guidance puts the UMP flow ahead of ATT;
  //   - ATT only when consent allows ads, so nobody is asked for tracking permission for
  //     ads they will never see;
  //   - the SDK last, because an ad request that goes out before consent is recorded is the
  //     policy breach that gets an AdMob account suspended -- and the account is shared by
  //     every app in the portfolio.
  // Idempotent: several screens call this, and re-gathering would re-present the
  // consent form each time.
  if (!consentGathered) applyConsent(await gatherConsent());
  if (!consent.canServeAds) {
    // Fail closed. `consentGathered` is what stops the form being re-presented
    // on every screen; latching `initialised` here would also make a later
    // opt-in unable to start the SDK.
    return;
  }
  await requestTrackingPermission();
  await initializeAds();
}
