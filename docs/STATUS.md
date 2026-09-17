# Rectap — build status

| Stage | State |
|---|---|
| Repo bootstrapped | ✅ |
| Recorder logic (`src/logic`, `src/recorder`) | ✅ |
| Native module (iOS broadcast extension, Android MediaProjection) | ✅ built, ⬜ never run on hardware |
| UI (home, recordings, settings, paywall) | ✅ |
| RevenueCat catalog | ⬜ |
| AdMob app + units | ⬜ |
| App Store Connect record | ⬜ |
| Play Console record | ⬜ |
| iOS simulator QA | ✅ builds, installs, launches, renders — recording itself is unverifiable there |
| Android emulator QA | ⬜ never built |
| Submitted | ⬜ |

**Option 3 of `SCOPE.md` was taken**: the app was built properly, with a real
ReplayKit Broadcast Upload Extension on iOS and a real MediaProjection
foreground service on Android, and the paid claims were cut down to the two that
are true (no ads, no 3-minute cap).

`npm run verify` now passes in full, `check-paywall-copy` included. What it does
**not** prove is that anything has ever been recorded: a simulator has no
ReplayKit broadcast infrastructure, so the capture path is still entirely
unexercised. `HANDOFF.md` lists every gate that is still `UNKNOWN` and what a
human has to do on a device to close them.

`npm run check:release` fails, correctly: no AdMob or RevenueCat identifiers
have been provisioned for this app yet.
