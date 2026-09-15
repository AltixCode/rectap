#!/usr/bin/env node
/**
 * Refuses paywall copy that still describes the template rather than this app.
 *
 * `_template` ships "Everything unlocked — every level, every mode and the full
 * archive" and "new content is added regularly and is always included". Most
 * apps generated from it have no modes, no archive, or no content pipeline, so
 * those sentences are false — and unlike a wrong screenshot they are a **paid**
 * claim, which makes them a refund and a store-review problem rather than only
 * an accuracy one.
 *
 * Nothing else catches this: the strings are present in all fourteen locales,
 * so check:i18n passes, and no test asserts that copy is true.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Where the claims live.
 *
 * Most apps keep them in `src/i18n/index.ts` under `feat*` keys. Some do not:
 * a single-language app can hardcode the sentences straight into the paywall
 * screen, and requiring the i18n file meant such an app was silently exempt —
 * a paywall no gate could read, reported as nothing at all. So fall back to
 * the screen itself and match on the sentences rather than the keys.
 */
function paywallSource() {
  const keyed = resolve(ROOT, 'src/i18n/index.ts');
  if (existsSync(keyed)) {
    const source = readFileSync(keyed, 'utf8');
    // The English block is the one an author edits; the rest follow from it.
    return { text: source.split('  en: {')[1]?.split('\n  es: {')[0] ?? '', keyed: true };
  }
  for (const rel of ['app/paywall.tsx', 'src/screens/PaywallScreen.tsx']) {
    const file = resolve(ROOT, rel);
    if (existsSync(file)) return { text: readFileSync(file, 'utf8'), keyed: false };
  }
  return null;
}

const found_source = paywallSource();
if (found_source === null) {
  console.log('check-paywall-copy: no paywall copy found — nothing to check.');
  process.exit(0);
}
const en = found_source.text;

const TEMPLATE_DEFAULTS = [
  ['feat2Desc', 'Every level, every mode and the full archive, at your own pace.'],
  ['feat2Title', 'Everything unlocked'],
  ['feat3Title', 'Your progress stays on the device'],
  ['feat4Desc', 'New content is added regularly and is always included.'],
];

const found = TEMPLATE_DEFAULTS.filter(([key, value]) => {
  if (!found_source.keyed) {
    // Hardcoded copy has no keys to look up, so the sentence itself is the
    // match. Same claim, same verdict, wherever it is written.
    return en.includes(value);
  }
  const match = en.match(new RegExp(`${key}: '([^']*)'`));
  return match && match[1] === value;
});

if (found.length) {
  console.error('check-paywall-copy: these still carry the template default:\n');
  for (const [key, value] of found) console.error(`  ${key}  "${value}"`);
  console.error('\nEach is a claim the buyer pays for. Rewrite them to what THIS app');
  console.error('unlocks — checked against its own source, not what would sell well —');
  console.error('in all fourteen locales. If a claim cannot be made honestly, cut the');
  console.error('feature and the claim.');
  process.exit(1);
}
console.log('check-paywall-copy: the paywall describes this app, not the template.');
