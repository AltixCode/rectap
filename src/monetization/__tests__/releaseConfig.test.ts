import {
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
