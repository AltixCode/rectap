const {
  withXcodeProject,
  withEntitlementsPlist,
  withDangerousMod,
  withInfoPlist,
} = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * Adds the ReplayKit broadcast upload extension that makes Rectap a screen recorder.
 *
 * Why an extension at all: `RPScreenRecorder` — the API every "record your screen in one
 * line" tutorial reaches for — records only the *host app's own UI*. It cannot see the home
 * screen, Safari, or any other app, which is the entire point of a screen recorder. The only
 * public iOS API that captures the whole device is a Broadcast Upload Extension: a second
 * process the system launches, hands the screen's sample buffers to, and kills when the user
 * stops. It has to be a real Xcode target with its own bundle identifier, which `expo
 * prebuild` does not generate, so this plugin creates it.
 *
 * The two processes share nothing but an App Group container. The extension writes the mp4
 * there; the app reads it back. Both targets therefore carry the same
 * `com.apple.security.application-groups` entitlement, and both compile `RectapShared.swift`
 * so the paths and keys cannot drift.
 *
 * Signing: the extension target is left on automatic signing with the project's development
 * team. CI archives with `-allowProvisioningUpdates` and an App Store Connect API key, which
 * is what registers the extension's App ID and its App Group on the first build.
 */

// Must match `RectapShared.appGroup` in modules/screen-recorder/ios/RectapShared.swift.
// The Swift side cannot import this file, so the pair is asserted by
// plugins/__tests__/withBroadcastExtension.test.js instead.
const APP_GROUP = "group.com.altixcode.rectap";

const TARGET_NAME = "RectapBroadcast";
const EXTENSION_BUNDLE_SUFFIX = "broadcast";

/** Files copied into the generated extension target, in build order. */
const SOURCES = [
  // One source of truth, compiled into both processes. The app gets its copy from
  // the ScreenRecorder podspec; the extension gets this one.
  {
    from: path.join("modules", "screen-recorder", "ios", "RectapShared.swift"),
    to: "RectapShared.swift",
  },
  {
    from: path.join("plugins", "broadcast", "SampleHandler.swift"),
    to: "SampleHandler.swift",
  },
];

const extensionBundleId = (config) =>
  `${config.ios.bundleIdentifier}.${EXTENSION_BUNDLE_SUFFIX}`;

/**
 * The extension's Info.plist.
 *
 * `NSExtensionPointIdentifier` is what makes iOS list this app in the system broadcast
 * picker at all, and `RPBroadcastProcessModeSampleBufferProcessing` is what makes the
 * system deliver raw buffers rather than expecting us to upload a stream somewhere. Get
 * either wrong and the app simply never appears in the picker, with no error anywhere.
 */
const infoPlist = (config) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleDevelopmentRegion</key>
	<string>$(DEVELOPMENT_LANGUAGE)</string>
	<key>CFBundleDisplayName</key>
	<string>${config.name}</string>
	<key>CFBundleExecutable</key>
	<string>$(EXECUTABLE_NAME)</string>
	<key>CFBundleIdentifier</key>
	<string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
	<key>CFBundleInfoDictionaryVersion</key>
	<string>6.0</string>
	<key>CFBundleName</key>
	<string>$(PRODUCT_NAME)</string>
	<key>CFBundlePackageType</key>
	<string>$(PRODUCT_BUNDLE_PACKAGE_TYPE)</string>
	<key>CFBundleShortVersionString</key>
	<string>${config.version}</string>
	<key>CFBundleVersion</key>
	<string>${config.ios.buildNumber || "1"}</string>
	<key>NSExtension</key>
	<dict>
		<key>NSExtensionPointIdentifier</key>
		<string>com.apple.broadcast-services-upload</string>
		<key>NSExtensionPrincipalClass</key>
		<string>$(PRODUCT_MODULE_NAME).SampleHandler</string>
		<key>RPBroadcastProcessMode</key>
		<string>RPBroadcastProcessModeSampleBufferProcessing</string>
	</dict>
</dict>
</plist>
`;

const entitlements = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>com.apple.security.application-groups</key>
	<array>
		<string>${APP_GROUP}</string>
	</array>
</dict>
</plist>
`;

/** Writes the extension's sources, Info.plist and entitlements into ios/<TARGET_NAME>/. */
function withExtensionFiles(config) {
  return withDangerousMod(config, [
    "ios",
    (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const destination = path.join(
        cfg.modRequest.platformProjectRoot,
        TARGET_NAME,
      );
      fs.mkdirSync(destination, { recursive: true });

      for (const source of SOURCES) {
        const absolute = path.join(projectRoot, source.from);
        if (!fs.existsSync(absolute)) {
          // Failing here rather than producing a target with no sources: an
          // extension that compiles to an empty binary still installs, and the
          // only symptom is that the app never records anything.
          throw new Error(
            `withBroadcastExtension: missing ${source.from}. The broadcast extension cannot be built without it.`,
          );
        }
        fs.copyFileSync(absolute, path.join(destination, source.to));
      }

      fs.writeFileSync(
        path.join(destination, `${TARGET_NAME}-Info.plist`),
        infoPlist(cfg),
        "utf8",
      );
      fs.writeFileSync(
        path.join(destination, `${TARGET_NAME}.entitlements`),
        entitlements,
        "utf8",
      );
      return cfg;
    },
  ]);
}

/** The app half of the App Group. Without this the app cannot read what the extension wrote. */
function withAppGroupEntitlement(config) {
  return withEntitlementsPlist(config, (cfg) => {
    const key = "com.apple.security.application-groups";
    const groups = new Set(cfg.modResults[key] || []);
    groups.add(APP_GROUP);
    cfg.modResults[key] = [...groups];
    return cfg;
  });
}

/**
 * Declares the extension so the app can pre-select it in `RPSystemBroadcastPickerView`.
 *
 * Without it the picker lists every broadcast extension on the device — Rectap's alongside
 * anyone else's — and one wrong tap sends the recording to a different app entirely.
 */
function withPickerHint(config) {
  return withInfoPlist(config, (cfg) => {
    cfg.modResults.RectapBroadcastExtensionBundleId = extensionBundleId(cfg);
    cfg.modResults.RectapAppGroup = APP_GROUP;
    return cfg;
  });
}

function withExtensionTarget(config) {
  return withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;

    // `expo prebuild` without --clean runs the mods over an existing project.
    // Adding the target twice produces a project Xcode refuses to open.
    const existing = project.pbxNativeTargetSection();
    for (const key of Object.keys(existing)) {
      if (key.endsWith("_comment")) continue;
      const name = String(existing[key].name || "").replace(/"/g, "");
      if (name === TARGET_NAME) return cfg;
    }

    const target = project.addTarget(
      TARGET_NAME,
      "app_extension",
      TARGET_NAME,
      extensionBundleId(cfg),
    );

    // addTarget creates the target, its product, the "Embed App Extensions" copy
    // phase on the app and the target dependency — but no compile phases at all.
    const sourcePaths = SOURCES.map((source) =>
      path.join(TARGET_NAME, source.to),
    );
    project.addBuildPhase(
      sourcePaths,
      "PBXSourcesBuildPhase",
      "Sources",
      target.uuid,
    );
    project.addBuildPhase(
      [],
      "PBXResourcesBuildPhase",
      "Resources",
      target.uuid,
    );
    // ReplayKit and AVFoundation are Swift modules and link themselves, but a
    // native target with no Frameworks phase confuses Xcode's own tooling.
    project.addBuildPhase(
      [],
      "PBXFrameworksBuildPhase",
      "Frameworks",
      target.uuid,
    );

    // Put the sources in a visible group. Purely so the target is navigable in
    // Xcode when something has to be debugged on a device.
    const group = project.pbxCreateGroup(TARGET_NAME, TARGET_NAME);
    const mainGroup = project.getFirstProject().firstProject.mainGroup;
    project.addToPbxGroup(group, mainGroup);

    applyBuildSettings(project, cfg, target);
    return cfg;
  });
}

/**
 * Rewrites the placeholder settings `addTarget` writes.
 *
 * Its defaults are aimed at Cordova and are wrong here in three ways that each break the
 * build outright: INFOPLIST_FILE points at a file that does not exist, there is no
 * SWIFT_VERSION (so the Swift sources are not compiled), and there is no deployment target
 * (so the extension targets a different iOS than the app it is embedded in, which the
 * archive step rejects).
 */
function applyBuildSettings(project, config, target) {
  const configurations = project.pbxXCBuildConfigurationSection();
  const listId = target.pbxNativeTarget.buildConfigurationList;
  const lists = project.pbxXCConfigurationList();
  const buildConfigs = lists[listId].buildConfigurations.map(
    (entry) => entry.value,
  );

  const deploymentTarget =
    (config.ios && config.ios.deploymentTarget) ||
    readDeploymentTarget(config) ||
    "16.4";

  for (const id of buildConfigs) {
    const settings = configurations[id].buildSettings;
    settings.INFOPLIST_FILE = `"${TARGET_NAME}/${TARGET_NAME}-Info.plist"`;
    settings.CODE_SIGN_ENTITLEMENTS = `"${TARGET_NAME}/${TARGET_NAME}.entitlements"`;
    settings.PRODUCT_BUNDLE_IDENTIFIER = `"${extensionBundleId(config)}"`;
    settings.SWIFT_VERSION = "5.0";
    settings.IPHONEOS_DEPLOYMENT_TARGET = deploymentTarget;
    settings.TARGETED_DEVICE_FAMILY = '"1,2"';
    settings.CODE_SIGN_STYLE = "Automatic";
    settings.CURRENT_PROJECT_VERSION = `"${config.ios.buildNumber || "1"}"`;
    settings.MARKETING_VERSION = `"${config.version}"`;
    settings.GENERATE_INFOPLIST_FILE = "NO";
    // The host app already embeds the Swift runtime; a second copy inside the
    // appex is rejected on upload as a duplicate dylib.
    settings.ALWAYS_EMBED_SWIFT_STANDARD_LIBRARIES = "NO";
    settings.SKIP_INSTALL = "YES";
    settings.CLANG_ENABLE_MODULES = "YES";
    settings.ENABLE_BITCODE = "NO";
    settings.APPLICATION_EXTENSION_API_ONLY = "YES";
  }
}

/** Mirrors whatever expo-build-properties put on the app, so the two agree. */
function readDeploymentTarget(config) {
  const plugins = config.plugins || [];
  for (const entry of plugins) {
    if (Array.isArray(entry) && entry[0] === "expo-build-properties") {
      const ios = (entry[1] || {}).ios || {};
      if (ios.deploymentTarget) return ios.deploymentTarget;
    }
  }
  return undefined;
}

module.exports = function withBroadcastExtension(config) {
  config = withExtensionFiles(config);
  config = withAppGroupEntitlement(config);
  config = withPickerHint(config);
  config = withExtensionTarget(config);
  return config;
};

module.exports.APP_GROUP = APP_GROUP;
module.exports.TARGET_NAME = TARGET_NAME;
module.exports.SOURCES = SOURCES;
