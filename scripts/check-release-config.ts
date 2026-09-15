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
 * Shape is checked before absence is reported, because a malformed identifier
 * is the more dangerous of the two by a wide margin. A missing one costs
 * revenue; a malformed AdMob app id makes the Ads SDK abort on startup, so the
 * app dies on its first frame — and it passes the missing-check, being present,
 * non-blank and not a test value.
 */
const malformed = malformedReleaseConfigFrom(process.env);
if (malformed.length > 0) {
  console.error('\n✗ This build would crash on launch.\n');
  for (const key of malformed) {
    console.error(`    ${explainMalformed(key, process.env[key] as string)}`);
  }
  console.error(
    [
      '',
      'An AdMob app id and an ad unit id differ only by "~" versus "/", and the',
      'Google Mobile Ads SDK treats a malformed app id as a programming error:',
      'it aborts, and the app dies on its first frame with nothing on screen.',
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
