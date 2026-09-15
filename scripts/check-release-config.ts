/**
 * Refuses a store build that would ship without its real AdMob and RevenueCat identifiers.
 *
 * A missing identifier does not crash anything: the app falls back to Google's test ad unit,
 * works perfectly, and earns nothing — or runs with no billing configured, which also means no
 * ads at all. Both are invisible in QA and only show up as a flat revenue line weeks later.
 *
 * Run: npm run check:release
 */
import { missingReleaseConfigFrom, RELEASE_ENV_KEYS } from '../src/monetization/releaseConfig';

const missing = missingReleaseConfigFrom(process.env);

if (missing.length === 0) {
  console.log(`✓ All ${RELEASE_ENV_KEYS.length} release identifiers are set.`);
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
