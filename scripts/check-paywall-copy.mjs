#!/usr/bin/env node
/**
 * Refuses to let an app ship the template's placeholder paywall copy.
 *
 * The paywall is the one screen where a sentence is a *paid* claim. The template ships
 * plausible-sounding defaults — "every level, every mode and the full archive", "new content
 * is added regularly and is always included" — and they are false for any app without levels
 * or a content pipeline, which is most of them. Nothing else catches it: the strings are
 * present, translated into fourteen locales, and render perfectly.
 *
 * Found in Dicewit, which had neither levels nor an archive and promised both.
 *
 * This checks the `en` block only. The other thirteen locales are translations of whatever
 * `en` says, so if `en` is honest they are too, and `check-i18n.mjs` already proves they exist.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(ROOT, 'src/i18n/index.ts'), 'utf8');

/**
 * The placeholders, verbatim. Matching on the exact default rather than on keywords means a
 * real app that genuinely does unlock every level can say so — this fails only copy nobody
 * has looked at.
 */
const PLACEHOLDERS = [
  'Everything unlocked',
  'Every level, every mode and the full archive, at your own pace.',
  'Your progress stays on the device',
  'Streaks and statistics are stored on your phone. No account, no sync.',
  'One payment, all future content',
  'New content is added regularly and is always included.',
];

// Only the `en` block: everything after it is a translation of it.
const start = source.indexOf('  en: {');
if (start === -1) {
  console.error('check-paywall-copy: could not find the en locale block');
  process.exit(1);
}
const end = source.indexOf('\n  },', start);
const en = source.slice(start, end === -1 ? undefined : end);

const found = PLACEHOLDERS.filter((text) => en.includes(`'${text}'`) || en.includes(`"${text}"`));

if (found.length > 0) {
  console.error('check-paywall-copy: the paywall still carries the template placeholder copy.\n');
  for (const text of found) console.error(`  ${text}`);
  console.error(
    '\nThese are claims a paying user is owed. Replace feat1-feat4 in every locale with\n' +
      'what THIS app actually does, and make sure each one is enforced somewhere in the code.\n' +
      'A benefit nobody implemented is a refund request and a store-review problem.',
  );
  process.exit(1);
}

console.log('check-paywall-copy: paywall copy is app-specific');
