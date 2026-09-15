# Rectap — build status

| Stage | State |
|---|---|
| Repo bootstrapped | ✅ |
| Game logic | ⛔ see `SCOPE.md` |
| UI | ⛔ see `SCOPE.md` |
| RevenueCat catalog | ⬜ |
| AdMob app + units | ⬜ |
| App Store Connect record | ⬜ |
| Play Console record | ⬜ |
| iOS simulator QA | ⬜ |
| Android emulator QA | ⬜ |
| Submitted | ⬜ |

**Deliberately unbuilt.** The app as specified cannot be delivered honestly
on this stack; `docs/SCOPE.md` sets out why and what the three options are.
This is a decision for the owner, not a task that is pending.

`npm run verify` fails here on purpose, at `check-paywall-copy`. The paywall
still carries the template's placeholder claims because there are no features
to describe. **The fix is not to write copy** — that would be inventing claims
for an app that does not exist. It is the gate correctly refusing a scaffold,
and it stays red until the slot is either dropped or given a real concept.
