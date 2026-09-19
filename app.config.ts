import type { ExpoConfig } from 'expo/config';

/**
 * Store identity and native configuration for Rectap.
 *
 * AdMob *app* ids must be baked into the native manifests, so they live here rather than in
 * JS. They are public identifiers, not secrets — but they still come from the environment so
 * a developer build can never accidentally ship with production ad units. With nothing
 * configured the Google sample app ids are used, which only ever serve test ads.
 */

/*
 * `||`, deliberately, not `??`.
 *
 * A GitHub Actions expression for a secret that is missing or empty renders as
 * the empty STRING, not as undefined — so `??` passes "" straight through and
 * the app ships with an empty GADApplicationIdentifier. The Google Mobile Ads
 * SDK treats that as a programming error and deliberately aborts at launch, so
 * the app dies on its first frame with no UI and no obvious cause. `||` falls
 * back to Google's test id, which is inert and lets the app run ad-free.
 *
 * Five repos currently have no AdMob secrets at all and would build exactly
 * that binary; they happen to fail the identifier gate first, which masks it.
 */
const IOS_ADMOB_APP_ID =
  process.env.ADMOB_IOS_APP_ID || 'ca-app-pub-3940256099942544~1458002511';
const ANDROID_ADMOB_APP_ID =
  process.env.ADMOB_ANDROID_APP_ID || 'ca-app-pub-3940256099942544~3347511713';

/**
 * SKAdNetwork identifiers for the ad networks AdMob mediates on iOS. Without these, iOS
 * install attribution silently fails. Refresh from
 * https://developers.google.com/admob/ios/3p-skadnetworks when the SDK is updated.
 */
const SK_AD_NETWORK_ITEMS = [
  'cstr6suwn9.skadnetwork', '4fzdc2evr5.skadnetwork', '2fnua5tdw4.skadnetwork',
  'ydx93a7ass.skadnetwork', 'p78axxw29g.skadnetwork', 'v72qych5uu.skadnetwork',
  'ludvb6z3bs.skadnetwork', 'cp8zw746q7.skadnetwork', '3sh42y64q3.skadnetwork',
  'c6k4g5qg8m.skadnetwork', 's39g8k73mm.skadnetwork', 'wg4vff78zm.skadnetwork',
  '3qy4746246.skadnetwork', 'f38h382jlk.skadnetwork', 'hs6bdukanm.skadnetwork',
  'mlmmfzh3r3.skadnetwork', 'v4nxqhlyqp.skadnetwork', 'wzmmz9fp6w.skadnetwork',
  'su67r6k2v3.skadnetwork', 'yclnxrl5pm.skadnetwork', 't38b2kh725.skadnetwork',
  '7ug5zh24hu.skadnetwork', 'gta9lk7p23.skadnetwork', 'vutu7akeur.skadnetwork',
  'y5ghdn5j9k.skadnetwork', 'v9wttpbfk9.skadnetwork', 'n38lu8286q.skadnetwork',
  '47vhws6wlr.skadnetwork', 'kbd757ywx3.skadnetwork', '9t245vhmpl.skadnetwork',
  'a2p9lx4jpn.skadnetwork', '22mmun2rn5.skadnetwork', '44jx6755aq.skadnetwork',
  'k674qkevps.skadnetwork', '4468km3ulz.skadnetwork', '2u9pt9hc89.skadnetwork',
  '8s468mfl3y.skadnetwork', 'klf5c3l5u5.skadnetwork', 'ppxm28t8ap.skadnetwork',
  'kbmxgpxpgc.skadnetwork', 'uw77j35x4d.skadnetwork', '578prtvx9j.skadnetwork',
  '4dzt52r2t5.skadnetwork', 'tl55sbb4fm.skadnetwork', 'c3frkrj4fj.skadnetwork',
  'e5fvkxwrpn.skadnetwork', '8c4e2ghe7u.skadnetwork', '3rd42ekr43.skadnetwork',
  '97r2b46745.skadnetwork', '3qcr597p9d.skadnetwork',
];

const TRACKING_USAGE =
  'This lets us show you ads that are more relevant to you. Your data is never sold, and Rectap works exactly the same either way.';

// Marketing version and build number.
//
// CI computes both from the commit count and passes them in, so a build is
// traceable to a commit and every upload gets a build number App Store Connect
// has not seen before. Locally they are absent and the defaults apply, which
// keeps `expo start` and the bundle exports working with no environment set up.
//
// There is no app.json here to rewrite — this file *is* the manifest — so the
// version cannot be bumped by editing JSON the way the older apps do it.
// `||` for the same reason as the AdMob ids above: these arrive from a CI step,
// and a step that produces nothing hands over "" rather than nothing at all.
// An empty CFBundleShortVersionString or CFBundleVersion is not a small
// cosmetic problem — it is an invalid Info.plist, which Apple rejects on
// upload and which nothing in this repo would have caught first.
const VERSION = process.env.APP_VERSION || '1.0.0';
const BUILD = process.env.APP_BUILD || '1';

const config: ExpoConfig = {
  name: 'Rectap',
  slug: 'rectap',
  version: VERSION,
  orientation: 'portrait',
  icon: './assets/icon.png',
  scheme: 'rectap',
  userInterfaceStyle: 'automatic',
  backgroundColor: '#150A0D',
  primaryColor: '#FB7185',
  assetBundlePatterns: ['**/*'],
  ios: {
    bundleIdentifier: 'com.altixcode.rectap',
    buildNumber: BUILD,
    supportsTablet: true,
    requireFullScreen: false,
    config: {
      // No custom crypto beyond standard HTTPS — declaring this skips the yearly
      // export-compliance questionnaire on every App Store Connect submission.
      usesNonExemptEncryption: false,
    },
    infoPlist: {
      // Answers Apple's export-compliance question once, in the build, so it
      // is not asked again on every submission of every app. These apps use
      // only the standard HTTPS the OS provides -- RevenueCat and AdMob over
      // TLS -- and ship no cryptography of their own, which is the exemption
      // this declares. Without the key App Store Connect asks at upload time,
      // and the answer carries legal weight rather than being a formality.
      ITSAppUsesNonExemptEncryption: false,
      UIBackgroundModes: [],
    },
  },
  android: {
    package: 'com.altixcode.rectap',
    versionCode: Number.parseInt(BUILD, 10),
    adaptiveIcon: {
      backgroundColor: '#150A0D',
      foregroundImage: './assets/android-icon-foreground.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    permissions: [
      'com.google.android.gms.permission.AD_ID',
      'com.android.vending.BILLING',
      'android.permission.INTERNET',
      'android.permission.VIBRATE',
    ],
    blockedPermissions: ['android.permission.ACCESS_COARSE_LOCATION'],
  },
  web: { favicon: './assets/favicon.png' },
  plugins: [
    'expo-router',
    // iOS 26+ refuses to launch apps that have not adopted the UIScene lifecycle, which
    // Expo SDK 57 / RN 0.86 do not yet generate. Drop this once the template does it itself.
    './plugins/withUIScene',
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 200,
        resizeMode: 'contain',
        backgroundColor: '#150A0D',
      },
    ],
    [
      'react-native-google-mobile-ads',
      {
        androidAppId: ANDROID_ADMOB_APP_ID,
        iosAppId: IOS_ADMOB_APP_ID,
        userTrackingUsageDescription: TRACKING_USAGE,
        skAdNetworkItems: SK_AD_NETWORK_ITEMS,
      },
    ],
    ['expo-tracking-transparency', { userTrackingPermission: TRACKING_USAGE }],
    [
      'expo-build-properties',
      {
        ios: { deploymentTarget: '16.4' },
        android: {
          compileSdkVersion: 36,
          targetSdkVersion: 36,
          minSdkVersion: 24,
          // R8 shrinking + obfuscation for release builds. Without this, Play
          // Console's pre-launch report flags the app under 25% obfuscation
          // and warns it may lose visibility/publishing eligibility.
          enableProguardInReleaseBuilds: true,
          enableShrinkResourcesInReleaseBuilds: true,
          // Two architectures, not Expo's default four.
          //
          // The default is ['armeabi-v7a','arm64-v8a','x86','x86_64'], and x86
          // and x86_64 are emulator targets — no phone or tablet in the Play
          // device population runs them. Building them compiled four native
          // targets (the app, expo-modules-core, gesture-handler, reanimated)
          // four times over: fifty-minute Android builds, and a Gradle daemon
          // killed for memory on a 7 GB runner.
          //
          // Halving the work halves the peak memory, which is what the kernel
          // was objecting to. The cost is that the app cannot install on x86
          // Android — some Chromebooks and a few uncommon tablets. Reversible
          // in one line, and nothing has shipped to Play.
          buildArchs: ['arm64-v8a', 'armeabi-v7a'],
        },
      },
    ],
  ],
  runtimeVersion: { policy: 'appVersion' },
  owner: process.env.EXPO_OWNER || 'altixcodes-team',
  extra: {
    eas: { projectId: process.env.EAS_PROJECT_ID },
  },
};

export default config;
