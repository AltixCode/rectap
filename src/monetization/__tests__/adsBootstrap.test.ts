/**
 * The order of the ads bootstrap, which is a policy question and not a style one.
 *
 * This exists because the code and its own comment disagreed. The comment said
 * "UMP consent first, then ATT"; the code asked for tracking first and gathered
 * consent second. On a device that showed up as the iOS tracking alert stacked
 * on top of the still-open consent form -- two modals at once, and the tracking
 * decision made before the user had been told what the ads were for.
 *
 * No existing test noticed, because every one of them mocked the two calls
 * independently and never asked which happened first.
 */

import { Platform } from 'react-native';

// ATT exists only on iOS, and the preset's Platform module cannot be replaced
// wholesale on RN 0.86 -- it is frozen and the mock path moved. The field is
// what the app itself reads.
beforeAll(() => {
  Object.defineProperty(Platform, 'OS', { get: () => 'ios', configurable: true });
});

/**
 * Runs `body` against a fresh copy of `ads.ts` and returns the calls it made.
 *
 * The mocks are taken *inside* the isolated registry. Taking them from this
 * file's own imports silently configures a different module instance -- the
 * first version of this test did that and every assertion saw an empty list.
 */
async function trace(
  consent: { canRequestAds: boolean } | Error,
  body: (ads: typeof import('../ads')) => Promise<void>,
): Promise<string[]> {
  const calls: string[] = [];
  await jest.isolateModulesAsync(async () => {
    /* eslint-disable @typescript-eslint/no-require-imports --
       `require` is required here, not preferred. A dynamic `import()` is
       resolved against the outer module registry, so it would hand back the
       same mock instances this file already imported -- the exact bug this
       helper exists to avoid -- and Jest's CJS runtime needs
       `--experimental-vm-modules` for ESM inside `isolateModules` anyway. */
    const { AdsConsent } = require('react-native-google-mobile-ads');
    const tracking = require('expo-tracking-transparency');

    AdsConsent.gatherConsent.mockImplementation(async () => {
      calls.push('gatherConsent');
      if (consent instanceof Error) throw consent;
      return {
        status: 'OBTAINED',
        canRequestAds: consent.canRequestAds,
        privacyOptionsRequirementStatus: 'REQUIRED',
      };
    });
    tracking.getTrackingPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true });
    tracking.requestTrackingPermissionsAsync.mockImplementation(async () => {
      calls.push('requestTracking');
      return { granted: false };
    });

    await body(require('../ads'));
    /* eslint-enable @typescript-eslint/no-require-imports */
  });
  return calls;
}

describe('bootstrapAds', () => {
  beforeEach(() => jest.clearAllMocks());

  it('gathers UMP consent before it asks for tracking permission', async () => {
    const calls = await trace({ canRequestAds: true }, (ads) => ads.bootstrapAds());
    expect(calls).toEqual(['gatherConsent', 'requestTracking']);
  });

  it('never asks for tracking when consent does not allow ads', async () => {
    // Nobody is asked for tracking permission for ads they will never see.
    const calls = await trace({ canRequestAds: false }, (ads) => ads.bootstrapAds());
    expect(calls).toEqual(['gatherConsent']);
  });

  it('presents the consent form once, not once per entry point', async () => {
    const calls = await trace({ canRequestAds: true }, async (ads) => {
      await ads.bootstrapAds();
      await ads.initializeAds();
      await ads.bootstrapAds();
    });
    expect(calls.filter((call) => call === 'gatherConsent')).toHaveLength(1);
  });

  it('serves no ads at all when the consent call throws', async () => {
    let served: boolean | null = null;
    const calls = await trace(new Error('no network'), async (ads) => {
      await ads.bootstrapAds();
      served = ads.getConsentSummary().canServeAds;
    });
    // Fail closed: a refusal is a decision, never a fallback to serving.
    expect(served).toBe(false);
    expect(calls).toEqual(['gatherConsent']);
  });
});
