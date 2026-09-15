/**
 * Release identifier policy. Deliberately free of any React Native import so the build-time
 * check (`npm run check:release`) can run it under plain Node.
 */

/** Google's own test ad unit prefix. Shipping one of these earns nothing, silently. */
export const TEST_AD_UNIT_PREFIX = 'ca-app-pub-3940256099942544';

export function present(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Every identifier a store build must carry. A production build missing one does not crash --
 * it quietly falls back to Google's test ad unit and earns nothing, or configures no billing
 * at all and shows no ads whatsoever, because entitlement never resolves. Both failures look
 * like a perfectly healthy app.
 *
 * The AdMob *app* ids are read by the config plugin at build time, so they carry no
 * EXPO_PUBLIC_ prefix; the unit ids and RevenueCat keys are read at runtime and do.
 */
export const RELEASE_ENV_KEYS = [
  'ADMOB_IOS_APP_ID',
  'ADMOB_ANDROID_APP_ID',
  'EXPO_PUBLIC_ADMOB_IOS_BANNER_ID',
  'EXPO_PUBLIC_ADMOB_ANDROID_BANNER_ID',
  'EXPO_PUBLIC_ADMOB_IOS_INTERSTITIAL_ID',
  'EXPO_PUBLIC_ADMOB_ANDROID_INTERSTITIAL_ID',
  'EXPO_PUBLIC_ADMOB_IOS_REWARDED_ID',
  'EXPO_PUBLIC_ADMOB_ANDROID_REWARDED_ID',
  'EXPO_PUBLIC_REVENUECAT_IOS_KEY',
  'EXPO_PUBLIC_REVENUECAT_ANDROID_KEY',
] as const;

/** Names the release identifiers that are absent, blank, or still a Google test value. */
export function missingReleaseConfigFrom(env: Record<string, string | undefined>): string[] {
  return RELEASE_ENV_KEYS.filter((key) => {
    const value = env[key];
    if (!present(value)) return true;
    return value.startsWith(TEST_AD_UNIT_PREFIX);
  });
}


/**
 * The shape each identifier must have.
 *
 * An AdMob *app* id and an ad *unit* id differ by a single character: the app
 * id joins its two halves with `~`, the unit id with `/`. They are otherwise
 * identical, they come from the same console, and they are trivially easy to
 * paste into the wrong slot.
 *
 * Getting it wrong is not a degraded build. The Google Mobile Ads SDK treats a
 * malformed application identifier as a programming error and deliberately
 * aborts, so the app dies on its first frame with no UI and nothing on screen
 * to say why — and `missingReleaseConfigFrom` waves it through, because the
 * value is present, non-blank and not a test id.
 *
 * Nothing else here can catch it: the identifiers are injected only for
 * release, so a Debug run on a simulator never sees them.
 */
const SHAPES: Record<string, { pattern: RegExp; describe: string }> = {
  ADMOB_IOS_APP_ID: {
    pattern: /^ca-app-pub-\d{10,}~\d{6,}$/,
    describe: 'an AdMob app id, joined with "~" (not an ad unit id, which uses "/")',
  },
  ADMOB_ANDROID_APP_ID: {
    pattern: /^ca-app-pub-\d{10,}~\d{6,}$/,
    describe: 'an AdMob app id, joined with "~" (not an ad unit id, which uses "/")',
  },
  AD_UNIT: {
    pattern: /^ca-app-pub-\d{10,}\/\d{6,}$/,
    describe: 'an AdMob ad unit id, joined with "/" (not an app id, which uses "~")',
  },
  REVENUECAT: {
    pattern: /^(appl|goog)_[A-Za-z0-9]{10,}$/,
    describe: 'a RevenueCat public SDK key, starting appl_ or goog_',
  },
};

function shapeFor(key: string): { pattern: RegExp; describe: string } | undefined {
  if (SHAPES[key]) return SHAPES[key];
  if (key.includes('REVENUECAT')) return SHAPES.REVENUECAT;
  if (key.includes('ADMOB')) return SHAPES.AD_UNIT;
  return undefined;
}

/** Explains why one identifier is the wrong shape, or null when it is fine. */
export function explainMalformed(key: string, value: string): string | null {
  const shape = shapeFor(key);
  if (!shape || shape.pattern.test(value)) return null;
  return `${key} is not ${shape.describe}`;
}

/**
 * Names the identifiers that are present but the wrong shape.
 *
 * Absence is deliberately not reported here — that is
 * `missingReleaseConfigFrom`'s job, and naming the same problem twice in two
 * vocabularies sends whoever reads the failure looking for two problems.
 */
export function malformedReleaseConfigFrom(
  env: Record<string, string | undefined>,
): string[] {
  return RELEASE_ENV_KEYS.filter((key) => {
    const value = env[key];
    if (!present(value)) return false;
    return explainMalformed(key, value) !== null;
  });
}
