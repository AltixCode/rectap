import { create } from 'zustand';

import type { ConsentSummary } from '@/monetization/consentPolicy';

/**
 * The UMP consent state, in a store rather than a module variable.
 *
 * Consent resolves asynchronously, after the first render. A component that read it from a
 * plain module getter would decide "no ads" on mount and never hear that consent arrived --
 * the banner would stay missing until some unrelated state change happened to re-render it.
 */
interface AdsConsentState {
  consent: ConsentSummary;
  setConsent: (consent: ConsentSummary) => void;
  resetForTests: () => void;
}

const INITIAL: ConsentSummary = { canServeAds: false, offerPrivacyOptions: false };

export const useAdsConsentStore = create<AdsConsentState>((set) => ({
  consent: INITIAL,
  setConsent: (consent) => set({ consent }),
  resetForTests: () => set({ consent: INITIAL }),
}));
