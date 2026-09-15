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
# iOS ends at "builds, installs, launches, renders": Simulator.app is missing
# from this Xcode install, so there is no window to click and the ATT prompt
# cannot be dismissed. Interaction is driven on Android.
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

step 'Building and installing on Android'
if ! npx expo run:android --device emulator-5554 >"$OUT/android-build.log" 2>&1; then
  tail -40 "$OUT/android-build.log"
  fail 'the Android build failed — any app already on the device is the OLD one'
fi

step 'Launching on Android'
adb shell am start -n "${BUNDLE_ID}/.MainActivity" >/dev/null
sleep 8
adb shell pidof "$BUNDLE_ID" >/dev/null || fail 'the app is not running after launch'
adb exec-out screencap -p > "$OUT/android-launch.png"
printf '  screenshot: %s\n' "$OUT/android-launch.png"

step 'Android: interaction is driven here (adb shell input)'
printf '  the emulator stays up for the feature walk; see HANDOFF.md\n'

# ------------------------------------------------------------------- iOS
step 'Freeing the machine before Xcode'
adb -s emulator-5554 emu kill >/dev/null 2>&1 || true
./android/gradlew --stop >/dev/null 2>&1 || true
sleep 3

step 'Building and installing on the iOS simulator'
if ! npx expo run:ios --configuration Release >"$OUT/ios-build.log" 2>&1; then
  tail -40 "$OUT/ios-build.log"
  fail 'the iOS build failed'
fi

UDID="$(xcrun simctl list devices booted -j | python3 -c 'import json,sys;d=json.load(sys.stdin)["devices"];print(next((x["udid"] for v in d.values() for x in v if x["state"]=="Booted"), ""))')"
[ -n "$UDID" ] || fail 'no booted simulator'

step 'Launching on iOS and checking it reaches first frame'
xcrun simctl terminate "$UDID" "$BUNDLE_ID" >/dev/null 2>&1 || true
xcrun simctl launch "$UDID" "$BUNDLE_ID" >/dev/null
sleep 8
# iOS 26+ quits straight back to the home screen without UIScene adoption, and
# the only trace is this device-log line.
if xcrun simctl spawn "$UDID" log show --last 1m --predicate 'eventMessage CONTAINS "UIScene life cycle is required"' 2>/dev/null | grep -q "UIScene life cycle"; then
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
