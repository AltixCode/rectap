#!/usr/bin/env bash
# Builds Rectap for both platforms and proves it actually ran.
#
# Three failures this exists to prevent, each paid for once across the portfolio:
#   - `expo run:android` can fail in a second and leave the PREVIOUS APK
#     installed, so the app launches, renders, and proves nothing. Each build's
#     own exit code is checked.
#   - A killed emulator leaves AVD lock files and the next start refuses with
#     "Another emulator instance is running", which reads like a stray process.
#   - An emulator and an Xcode build together exhaust this machine, and the
#     symptom shows up on the NEXT app. The emulator is killed before Xcode runs.
#
# iOS used to end at "builds, installs, launches, renders", because Simulator.app
# is missing from this Xcode install and there is no window to click. That is no
# longer true: idb drives the simulator headlessly, including the ATT prompt,
# which had never been exercised anywhere in this portfolio until it did.
#   ../next-mobile-apps/scripts/idb-ui.py <udid> labels|find|tap
# Tap by accessibility LABEL, not coordinate — idb takes points, which differ
# between a phone and a 13" iPad, so a coordinate script needs rewriting per
# device and a label script does not. Android has the same interface in
# scripts/adb-ui.py.
set -euo pipefail
cd "$(dirname "$0")/.."

BUNDLE_ID="com.altixcode.rectap"
SLUG="rectap"
# JAVA_HOME on this machine points at a path that does not exist; Gradle then
# silently falls back to JDK 25 and CMake dies with "a restricted method in
# java.lang.System has been called".
export JAVA_HOME="${JAVA_HOME_17:-/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home}"
OUT="${TMPDIR:-/tmp}/${SLUG}-verify"
mkdir -p "$OUT"

step() { printf '\n\033[1m▸ %s\033[0m\n' "$1"; }
fail() { printf '\n\033[31m✗ %s\033[0m\n' "$1"; exit 1; }

cleanup() {
  [ -n "${METRO_PID:-}" ] && kill "$METRO_PID" >/dev/null 2>&1 || true
  adb -s emulator-5554 emu kill >/dev/null 2>&1 || true
  pkill -f "qemu-system" >/dev/null 2>&1 || true
  rm -f "$HOME/.android/avd/"*.avd/*.lock 2>/dev/null || true
  ./android/gradlew --stop >/dev/null 2>&1 || true
}
trap cleanup EXIT

# ---------------------------------------------------------------- Android
step 'Booting the Android emulator (headless, software-rendered)'
AVD="$(emulator -list-avds | head -1)"
[ -n "$AVD" ] || fail 'no AVD is defined'
rm -f "$HOME/.android/avd/"*.avd/*.lock 2>/dev/null || true
emulator -avd "$AVD" -no-window -no-audio -gpu swiftshader_indirect -no-snapshot >"$OUT/emulator.log" 2>&1 &
adb wait-for-device
until [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do sleep 2; done
adb reverse tcp:8081 tcp:8081 || true

step 'Starting Metro separately'
# `expo run:android` without --no-bundler starts the bundler in the FOREGROUND and never
# returns, so a script that waits for it waits forever — after a build that succeeded and an
# app that launched. Metro is started here instead, and the build is told not to start one.
npx expo start --port 8081 >"$OUT/metro.log" 2>&1 &
METRO_PID=$!
for _ in $(seq 1 60); do
  grep -q "Waiting on http://localhost:8081" "$OUT/metro.log" && break
  sleep 1
done

step 'Building and installing on Android'
# `-d` takes the AVD *name*, not the adb serial: passing `emulator-5554` fails with
# "Could not find device with name", which reads like the emulator never booted.
if ! npx expo run:android -d "$AVD" --no-bundler >"$OUT/android-build.log" 2>&1; then
  tail -40 "$OUT/android-build.log"
  fail 'the Android build failed — any app already on the device is the OLD one'
fi

step 'Launching on Android'
adb shell am start -n "${BUNDLE_ID}/.MainActivity" >/dev/null
sleep 8
adb shell pidof "$BUNDLE_ID" >/dev/null || fail 'the app is not running after launch'
# The app reaching its ad bootstrap is the first evidence that JS actually ran, rather than
# the process merely existing. A missing consent line and a live pid is a white screen.
for _ in $(seq 1 30); do
  grep -q '\[ads\] consent' "$OUT/metro.log" && break
  sleep 1
done
grep -q '\[ads\] consent' "$OUT/metro.log" \
  || fail 'the app launched but its JS never reached the ad bootstrap'
adb exec-out screencap -p > "$OUT/android-launch.png"
printf '  screenshot: %s\n' "$OUT/android-launch.png"

step 'Android: interaction is driven here (adb shell input)'
printf '  the emulator stays up for the feature walk; see HANDOFF.md\n'

# ------------------------------------------------------------------- iOS
step 'Freeing the machine before Xcode'
[ -n "${METRO_PID:-}" ] && kill "$METRO_PID" >/dev/null 2>&1 || true
METRO_PID=""
adb -s emulator-5554 emu kill >/dev/null 2>&1 || true
./android/gradlew --stop >/dev/null 2>&1 || true
sleep 3

step 'Booting the iOS simulator'
# A device set can go stale and report a device as available that CoreSimulator then refuses
# to boot with "Unable to boot deleted device". Pruning first costs a second and removes a
# failure that reads like a broken Xcode.
xcrun simctl delete unavailable >/dev/null 2>&1 || true
UDID="$(xcrun simctl list devices available -j | python3 -c 'import json,sys;d=json.load(sys.stdin)["devices"];print(next((x["udid"] for k,v in d.items() if "iOS" in k for x in v if x["name"].startswith("iPhone")), ""))')"
[ -n "$UDID" ] || fail 'no iOS simulator is available'
xcrun simctl boot "$UDID" >/dev/null 2>&1 || true
until [ "$(xcrun simctl list devices -j | python3 -c "import json,sys;d=json.load(sys.stdin)['devices'];print(next((x['state'] for v in d.values() for x in v if x['udid']=='$UDID'), ''))")" = "Booted" ]; do sleep 2; done

step 'Building and installing on the iOS simulator'
# This install SUCCEEDS and the command still exits non-zero: Simulator.app is missing from
# this Xcode install, so expo's final "open the simulator" step always fails. The build's own
# success is therefore judged by whether the app is installed, not by the exit code.
npx expo run:ios --configuration Release --device "$UDID" >"$OUT/ios-build.log" 2>&1 || true
if ! xcrun simctl get_app_container "$UDID" "$BUNDLE_ID" >/dev/null 2>&1; then
  tail -40 "$OUT/ios-build.log"
  fail 'the iOS build failed — the app is not installed on the simulator'
fi
step 'Launching on iOS and checking it reaches first frame'
xcrun simctl terminate "$UDID" "$BUNDLE_ID" >/dev/null 2>&1 || true
xcrun simctl launch "$UDID" "$BUNDLE_ID" >/dev/null
sleep 8
# iOS 26+ quits straight back to the home screen without UIScene adoption, and
# the only trace is this device-log line.
# `log show` logs its OWN invocation, arguments included, so a predicate searching for this
# string always matches the search itself. Filtering the `log` process out is what makes the
# check mean anything; without it this gate fails every run, on every healthy app.
if xcrun simctl spawn "$UDID" log show --last 1m \
     --predicate 'eventMessage CONTAINS "UIScene life cycle is required" AND process != "log"' \
     --style compact 2>/dev/null | grep -q "UIScene life cycle"; then
  fail 'the app died on launch: UIScene adoption is missing (plugins/withUIScene)'
fi
xcrun simctl io "$UDID" screenshot "$OUT/ios-light.png"

step 'iOS dark appearance'
xcrun simctl ui "$UDID" appearance dark
sleep 3
xcrun simctl io "$UDID" screenshot "$OUT/ios-dark.png"
xcrun simctl ui "$UDID" appearance light

printf '\n\033[32m✓ Built, installed, launched and rendered on both platforms.\033[0m\n'
printf '  %s\n' "$OUT"/*.png
printf '\nStill UNKNOWN until driven by hand: purchases, ads, and every game flow.\n'
