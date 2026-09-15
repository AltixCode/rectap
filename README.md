# Rectap

One tap records your screen. No watermark.

Expo (SDK 57) + React Native 0.86 + TypeScript (strict), `expo-router`, Zustand,
RevenueCat for purchases and Google AdMob for ads. Part of the AltixCode mobile
portfolio — see `/Volumes/ExtremePro/Dev/MOBILE-PLAYBOOK.md` for the shared release
procedure.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in only if you need live ads/purchases locally
npm start
```

With no RevenueCat key and no AdMob unit configured the app runs as a free,
ad-free build rather than crashing — that is deliberate, so a fresh clone and CI
both work with no secrets.

## Scripts

| Command | What it does |
|---|---|
| `npm start` | Expo dev server |
| `npm run ios` / `npm run android` | Native run on a simulator/emulator |
| `npm test` | Jest |
| `npm run verify` | Lint + typecheck + tests with coverage — the pre-commit gate |
| `npm run assets` | Regenerates every icon and splash from `scripts/generate-assets.mjs` |
| `npm run check:release` | Refuses a store build missing real AdMob/RevenueCat ids |
| `npm run build:production` | EAS production build (runs `check:release` first) |

## Architecture

```
app/          expo-router routes (screens only — no game rules live here)
src/logic/    pure, native-free game logic, exhaustively unit tested
src/store/    Zustand stores (persistence via AsyncStorage)
src/monetization/  RevenueCat, AdMob, UMP consent and the pure gating rules
src/theme/    design tokens, palette, ThemeProvider
src/components/    shared UI
```

The rule that makes this repo fast to work on: **`src/logic/` imports nothing
from React or React Native.** Every rule, score and win condition is a plain
function over plain data, so it is proven by `npm test` without a simulator.

## Monetization

One RevenueCat entitlement, `pro`, granted by a lifetime non-consumable
("Remove Ads") offered alongside yearly and monthly. AdMob serves an anchored
banner plus a paced interstitial (`src/monetization/adPolicy.ts`); UMP consent
and iOS ATT gate initialisation and **fail closed** — no consent, no ads.

## License

Proprietary © AltixCode.
