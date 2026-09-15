#!/usr/bin/env bash
# Every check that can run without a device, ordered so the cheapest failure
# reads first. This proves the graph resolves and the logic is sound. It does
# NOT prove the app launches — only scripts/verify-app.sh on a real simulator
# and emulator does that.
set -euo pipefail
cd "$(dirname "$0")/.."

step() { printf '\n\033[1m▸ %s\033[0m\n' "$1"; }

step 'Lint'
npm run lint

step 'tsconfig still includes the generated route types'
node scripts/check-tsconfig.mjs

step 'TypeScript'
npm run typecheck

step 'Unit tests'
npm test -- --ci --coverage

step 'i18n completeness (14 locales, no partial key set)'
node scripts/check-i18n.mjs

step 'UI rules (colour tokens, t(), NativeWind no-ops)'
node scripts/check-ui-rules.mjs

step 'Expo configuration resolves'
npx expo config --type public >/dev/null

step 'iOS bundle'
npx expo export --platform ios --output-dir "${TMPDIR:-/tmp}/rectap-verify-ios" >/dev/null

step 'Android bundle'
npx expo export --platform android --output-dir "${TMPDIR:-/tmp}/rectap-verify-android" >/dev/null

printf '\n\033[32mAll device-free checks passed.\033[0m\n'
printf 'Still UNKNOWN until run on hardware: launch, core flow, purchases, ads.\n'
