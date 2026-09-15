# Rectap — agent notes

Read this before changing anything.

**This app inherits three layers, in order.** Later layers add detail; they
never contradict an earlier one.

1. `/Volumes/ExtremePro/Dev/AGENTS.md` — the portfolio manifest
2. `/Volumes/ExtremePro/Dev/docs/agents/19-expo-app-standard.md` — the standard
   every Expo app here meets, and why each rule exists.
   Alongside it: `20-expo-shared-template.md` (how this app was generated and
   how template drift is caught), `21-console-automation.md` (simulators,
   emulators and the store consoles), `18-app-lifecycle.md` (phase order).
3. This file.

This app's plan section is in
`/Volumes/ExtremePro/Dev/mobile_expo_apps/_shared/ADS-PLAN.md`.

**Shared code is generated, not owned here.** Everything outside `src/logic/`
and the game screens comes from `mobile_expo_apps/_shared` (`AltixCode/next-mobile-apps`).
Fix it there, then re-render — `node scripts/bootstrap.mjs rectap` or
`node scripts/check-drift.mjs --fix`. Editing the copy here means the next
regeneration silently reverts it, and **a fix in the template does nothing for
an app already generated** until something re-renders it.

## Non-negotiables

1. **Nothing is faked.** A feature is genuinely implemented on device or it does
   not exist — in code, in the UI, in store metadata, or in a status report.
   Store enforcement is account-level: one deceptive app can take the whole
   portfolio down.
2. **A build is not a verification.** `tsc`, `expo export` and `xcodebuild` all
   pass on an app that dies before its first frame. Proof is the artifact.
   Unverified is `UNKNOWN` in `HANDOFF.md`, never a pass.
3. **TDD.** Write the failing test first, watch it fail, then write the code.
4. **`src/logic/` imports nothing from `react`, `react-native` or `expo-*`.**
   That is what lets the rules be iterated on from `npm test` alone.
5. **Every user-facing string goes through `t()`** — errors, empty states,
   alerts, accessibility labels and paywall copy included. Fourteen locales;
   `ar` and `fa` must actually lay out RTL. `npm run check:i18n` and
   `npm run check:ui` are the hard stops.
6. **No colour literal outside `src/theme/`.** Both themes are designed, and
   both are checked for AA contrast by a unit test.
7. **One purchase, never a subscription.** A lifetime non-consumable grants the
   `remove_ads` entitlement, which removes the ads *and* unlocks everything.
8. **Ads fail closed.** No UMP consent means no ad request — an ad request made
   for an EEA user who never saw a form is what gets an AdMob account suspended.
9. **No secret in the repo.** A build without identifiers runs free and ad-free
   rather than crashing; `npm run check:release` is what stops that shipping.
10. **Never hand-edit `ios/` or `android/`** — `expo prebuild` regenerates them.
    Native changes go in an Expo config plugin.

## Commands

| | |
|---|---|
| `npm run verify` | every device-free gate, cheapest failure first |
| `npm run verify:device` | builds, installs and launches on simulator + emulator |
| `npm run check:release` | refuses a store build still carrying test ad units |
| `npm run assets` | regenerates every icon and splash from the mark |

## Identifiers

| | |
|---|---|
| Bundle id / package | `com.altixcode.rectap` |
| Scheme | `rectap://` |
| RevenueCat entitlement | `remove_ads` |
| RevenueCat package | `$rc_lifetime` |
| iOS product | `com.altixcode.rectap.removeads` |
| Android product | `remove_ads` |
| GitHub | `AltixCode/rectap` |

App Store Connect, Play Console, AdMob and RevenueCat ids are recorded in
`docs/setup-accounts.md` as they are provisioned. Status and what is still
`UNKNOWN`: `HANDOFF.md`.
