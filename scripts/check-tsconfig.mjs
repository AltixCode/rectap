#!/usr/bin/env node
/**
 * Refuses a tsconfig that `expo prebuild` has quietly rewritten.
 *
 * Prebuild reformats tsconfig.json and drops `.expo/types/**` and
 * `expo-env.d.ts` from `include`. Nothing fails: expo-router's generated route
 * types simply stop being loaded, typed routes degrade to `string`, and
 * `router.push('/nonexistent')` becomes legal. Typecheck stays green, so the
 * only way to catch it is to assert the file still says what it should.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REQUIRED = ['**/*.ts', '**/*.tsx', '.expo/types/**/*.ts', 'expo-env.d.ts'];

const config = JSON.parse(readFileSync(resolve(ROOT, 'tsconfig.json'), 'utf8'));
const include = config.include ?? [];
const missing = REQUIRED.filter((entry) => !include.includes(entry));

if (missing.length) {
  console.error(`check-tsconfig: tsconfig.json "include" is missing ${missing.join(', ')}.`);
  console.error('This is what `expo prebuild` does to it. Restore them, or expo-router route');
  console.error('types stop being checked and nothing else will tell you.');
  process.exit(1);
}
console.log(`check-tsconfig: include carries all ${REQUIRED.length} required entries.`);
