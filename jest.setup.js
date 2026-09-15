/* eslint-env jest */
// RNTL v13+ registers its matchers automatically via the jest-expo preset.

// RNTL 14's automatic cleanup is ASYNC. Left to run on its own it can unmount
// the NEXT test's freshly rendered tree, which surfaces as "unable to find an
// element" on a screen that plainly renders it in isolation. Awaiting it here
// — registered before any suite's own afterEach, so it runs last — makes the
// teardown finish inside the test that caused it.
const { cleanup } = require('@testing-library/react-native');
afterEach(async () => {
  await cleanup();
});

process.env.EXPO_OS = process.env.EXPO_OS || 'ios';

// Reanimated's worklet runtime is native-only. The shipped mock renders the
// animated components synchronously, which is what component tests need.
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// The ads SDK is native-only; the contract we care about is "does a banner
// element appear at all", so a marker view is enough.
jest.mock('react-native-google-mobile-ads', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: () => ({
      initialize: jest.fn().mockResolvedValue([]),
      setRequestConfiguration: jest.fn().mockResolvedValue(undefined),
    }),
    BannerAd: (props) => React.createElement(View, { testID: 'banner-ad', ...props }),
    BannerAdSize: { ANCHORED_ADAPTIVE_BANNER: 'ANCHORED_ADAPTIVE_BANNER' },
    MaxAdContentRating: { G: 'G' },
    InterstitialAd: { createForAdRequest: jest.fn(() => ({ load: jest.fn(), show: jest.fn(), addAdEventListener: jest.fn(() => jest.fn()) })) },
    RewardedAd: { createForAdRequest: jest.fn(() => ({ load: jest.fn(), show: jest.fn(), addAdEventListener: jest.fn(() => jest.fn()) })) },
    AdEventType: { LOADED: 'loaded', CLOSED: 'closed', ERROR: 'error' },
    RewardedAdEventType: { LOADED: 'rewarded_loaded', EARNED_REWARD: 'rewarded_earned_reward' },
    AdsConsent: {
      gatherConsent: jest.fn().mockResolvedValue({ status: 'NOT_REQUIRED', canRequestAds: true, privacyOptionsRequirementStatus: 'NOT_REQUIRED' }),
      showPrivacyOptionsForm: jest.fn(),
    },
    AdsConsentDebugGeography: { OTHER: 'OTHER', EEA: 'EEA' },
  };
});

jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    configure: jest.fn().mockResolvedValue(undefined),
    setLogLevel: jest.fn(),
    getCustomerInfo: jest.fn(),
    getOfferings: jest.fn(),
    purchasePackage: jest.fn(),
    restorePurchases: jest.fn(),
    addCustomerInfoUpdateListener: jest.fn(),
    removeCustomerInfoUpdateListener: jest.fn(),
  },
  LOG_LEVEL: { WARN: 'WARN', DEBUG: 'DEBUG' },
}));

jest.mock('expo-localization', () => ({
  getLocales: jest.fn(() => [{ languageCode: 'en', regionCode: 'US' }]),
  getCalendars: jest.fn(() => []),
}));

jest.mock('expo-tracking-transparency', () => ({
  getTrackingPermissionsAsync: jest.fn().mockResolvedValue({ granted: false, canAskAgain: true }),
  requestTrackingPermissionsAsync: jest.fn().mockResolvedValue({ granted: false }),
}));

// One stable router object, so a test can assert on navigation by calling
// `useRouter()` itself — a fresh set of spies per call would be unobservable.
jest.mock('expo-router', () => {
  const React = require('react');
  const router = {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    navigate: jest.fn(),
    dismiss: jest.fn(),
    dismissAll: jest.fn(),
    setParams: jest.fn(),
    canGoBack: jest.fn(() => true),
  };
  // Route params are mutable for the same reason: a screen under test needs to
  // be given an id, and `jest.requireActual('expo-router')` is not an option —
  // the real module is untransformed ESM and Jest cannot parse it.
  const params = {};
  return {
    Link: ({ children }) => children,
    Stack: { Screen: () => null },
    useRouter: () => router,
    router,
    params,
    setParams: (next) => {
      Object.keys(params).forEach((k) => delete params[k]);
      Object.assign(params, next);
    },
    useLocalSearchParams: () => params,
    useSegments: () => [],
    usePathname: () => '/',
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useFocusEffect: (cb) => React.useEffect(() => cb(), []),
  };
});
