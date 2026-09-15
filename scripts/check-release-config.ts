/**
 * Refuses a store build that would ship without its real AdMob and RevenueCat identifiers.
 *
 * A missing identifier does not crash anything: the app falls back to Google's test ad unit,
 * works perfectly, and earns nothing — or runs with no billing configured, which also means no
 * ads at all. Both are invisible in QA and only show up as a flat revenue line weeks later.
 *
 * Run: npm run check:release
 */
import {
  explainMalformed,
  malformedReleaseConfigFrom,
  missingReleaseConfigFrom,
  RELEASE_ENV_KEYS,
} from '../src/monetization/releaseConfig';

const missing = missingReleaseConfigFrom(process.env);

/*
 * Shape is checked before absence, and only the AdMob *app* ids are fatal.
 *
 * That split is evidence-based, not caution. A malformed app id provably ships
 * a binary that dies: six apps went to TestFlight with
 * `GADApplicationIdentifier` set to the literal string "-", read straight out
 * of their IPAs, and the Google Mobile Ads SDK raises at startup on it. The app
 * id reaches the Info.plist through the config plugin at prebuild, so a bad
 * repo secret lands in the binary with nothing in between.
 *
 * The unit ids and RevenueCat keys are different. Loopwits' repo secrets for
 * those are placeholders, yet its shipped bundle contains real values — they
 * are supplied to the build from the EAS environment instead. So a malformed
 * repo secret there does not mean a broken build, and failing on it would
 * block builds that work. Those are reported and not fatal; a genuinely
 * missing one is still caught by the absence check below, which is what has
 * always guarded revenue.
 */
const malformed = malformedReleaseConfigFrom(process.env);
const fatal = malformed.filter((key) => key.endsWith('_APP_ID'));
const advisory = malformed.filter((key) => !key.endsWith('_APP_ID'));

if (advisory.length > 0) {
  console.warn('\n! Identifiers that do not look right, but are not fatal:\n');
  for (const key of advisory) {
    console.warn(`    ${explainMalformed(key, process.env[key] as string)}`);
  }
  console.warn(
    '\nThese can legitimately come from the EAS environment rather than a\n' +
      'repository secret, so a placeholder here does not necessarily reach the\n' +
      'build. Worth checking; not worth failing.\n',
  );
}

if (fatal.length > 0) {
  console.error('\n\u2717 This build would crash on launch.\n');
  for (const key of fatal) {
    console.error(`    ${explainMalformed(key, process.env[key] as string)}`);
  }
  console.error(
    [
      '',
      'The AdMob app id goes into the Info.plist at prebuild, so this value',
      'reaches the binary directly. The Google Mobile Ads SDK treats a malformed',
      'application identifier as a programming error and aborts: the app dies on',
      'its first frame with nothing on screen. Six apps have already shipped',
      'exactly this, carrying the literal string "-".',
      'Correct the value in the repository secret, not here.',
      '',
    ].join('\n'),
  );
  process.exit(1);
}

if (missing.length === 0) {
  console.log(`✓ All ${RELEASE_ENV_KEYS.length} release identifiers are set and well formed.`);
  process.exit(0);
}

console.error('\n✗ This build is not ready for the stores.\n');
console.error('Missing, blank, or still a Google test value:\n');
missing.forEach((key) => console.error(`    ${key}`));
console.error(
  [
    '',
    'Without these the app serves Google test ads, or no ads at all, and earns nothing.',
    'Set them as EAS environment variables for the production environment:',
    '',
    '    eas env:create --environment production --name <KEY> --value <value>',
    '',
  ].join('\n'),
);
process.exit(1);
