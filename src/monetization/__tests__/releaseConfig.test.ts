import {
  malformedReleaseConfigFrom,
  missingReleaseConfigFrom,
  present,
  RELEASE_ENV_KEYS,
  TEST_AD_UNIT_PREFIX,
} from '../releaseConfig';

const complete = Object.fromEntries(
  RELEASE_ENV_KEYS.map((key) => [key, `real-${key.toLowerCase()}`]),
) as Record<string, string>;

describe('present', () => {
  it.each([
    [undefined, false],
    ['', false],
    ['   ', false],
    ['x', true],
  ])('treats %p as present=%p', (value, expected) => {
    expect(present(value as string | undefined)).toBe(expected);
  });
});

describe('missingReleaseConfigFrom', () => {
  it('passes a fully configured environment', () => {
    expect(missingReleaseConfigFrom(complete)).toEqual([]);
  });

  it('names every key that is absent', () => {
    expect(missingReleaseConfigFrom({})).toEqual([...RELEASE_ENV_KEYS]);
  });

  it('rejects a blank value as firmly as a missing one', () => {
    const env = { ...complete, [RELEASE_ENV_KEYS[0]]: '   ' };
    expect(missingReleaseConfigFrom(env)).toEqual([RELEASE_ENV_KEYS[0]]);
  });

  it("rejects Google's test ad units, which earn nothing but look healthy", () => {
    const env = { ...complete, [RELEASE_ENV_KEYS[0]]: `${TEST_AD_UNIT_PREFIX}~1458002511` };
    expect(missingReleaseConfigFrom(env)).toEqual([RELEASE_ENV_KEYS[0]]);
  });

  it('covers all ten release identifiers', () => {
    // Two AdMob app ids, six ad units, two RevenueCat keys. A shrinking key list
    // is a silent regression: it would let a build ship missing exactly the
    // identifier this check exists to catch.
    expect(RELEASE_ENV_KEYS).toHaveLength(10);
  });
});


/**
 * Format, not just presence.
 *
 * An AdMob *app* id and an ad *unit* id differ by one character — `~` versus
 * `/` — and are otherwise indistinguishable. Putting a unit id in the app-id
 * slot passes every check we had: it is present, it is non-blank, and it is not
 * a Google test value. It also makes the Google Mobile Ads SDK abort on
 * startup, so the app dies on its first frame with nothing on screen.
 *
 * That failure is invisible to every device-free gate in this repo, and to a
 * simulator Debug run, because the identifiers are only injected for release.
 */
describe('malformedReleaseConfigFrom', () => {
  const realistic = {
    ADMOB_IOS_APP_ID: 'ca-app-pub-2504845459806550~1458002511',
    ADMOB_ANDROID_APP_ID: 'ca-app-pub-2504845459806550~3347511713',
    EXPO_PUBLIC_ADMOB_IOS_BANNER_ID: 'ca-app-pub-2504845459806550/1057498540',
    EXPO_PUBLIC_ADMOB_ANDROID_BANNER_ID: 'ca-app-pub-2504845459806550/1174891927',
    EXPO_PUBLIC_ADMOB_IOS_INTERSTITIAL_ID: 'ca-app-pub-2504845459806550/1520532972',
    EXPO_PUBLIC_ADMOB_ANDROID_INTERSTITIAL_ID: 'ca-app-pub-2504845459806550/2370580212',
    EXPO_PUBLIC_ADMOB_IOS_REWARDED_ID: 'ca-app-pub-2504845459806550/2439872132',
    EXPO_PUBLIC_ADMOB_ANDROID_REWARDED_ID: 'ca-app-pub-2504845459806550/3227919200',
    EXPO_PUBLIC_REVENUECAT_IOS_KEY: 'appl_abcdefghijklmnopqrstuvwxyz',
    EXPO_PUBLIC_REVENUECAT_ANDROID_KEY: 'goog_abcdefghijklmnopqrstuvwxyz',
  };

  it('accepts a realistic, correctly shaped environment', () => {
    expect(malformedReleaseConfigFrom(realistic)).toEqual([]);
  });

  it('catches an ad unit id sitting in the app id slot', () => {
    const env = { ...realistic, ADMOB_IOS_APP_ID: 'ca-app-pub-2504845459806550/1057498540' };
    expect(malformedReleaseConfigFrom(env)).toEqual(['ADMOB_IOS_APP_ID']);
  });

  it('catches an app id sitting in an ad unit slot', () => {
    const env = {
      ...realistic,
      EXPO_PUBLIC_ADMOB_IOS_BANNER_ID: 'ca-app-pub-2504845459806550~1458002511',
    };
    expect(malformedReleaseConfigFrom(env)).toEqual(['EXPO_PUBLIC_ADMOB_IOS_BANNER_ID']);
  });

  it('catches a placeholder that someone meant to replace', () => {
    const env = { ...realistic, ADMOB_ANDROID_APP_ID: 'PENDING' };
    expect(malformedReleaseConfigFrom(env)).toEqual(['ADMOB_ANDROID_APP_ID']);
  });

  it('catches a RevenueCat key that is not a RevenueCat key', () => {
    const env = { ...realistic, EXPO_PUBLIC_REVENUECAT_IOS_KEY: 'ca-app-pub-250/105' };
    expect(malformedReleaseConfigFrom(env)).toEqual(['EXPO_PUBLIC_REVENUECAT_IOS_KEY']);
  });

  it('says nothing about a value that is simply absent', () => {
    // Absence is missingReleaseConfigFrom's job. Reporting it twice, in two
    // different vocabularies, sends whoever reads the failure looking for two
    // problems when there is one.
    const { ADMOB_IOS_APP_ID: _omitted, ...rest } = realistic;
    expect(malformedReleaseConfigFrom(rest)).toEqual([]);
  });
});
