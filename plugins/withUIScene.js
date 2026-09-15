const {
  withInfoPlist,
  withAppDelegate,
  withXcodeProject,
  withDangerousMod,
  IOSConfig,
} = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Adopts the UIKit scene lifecycle.
 *
 * Apps built against the iOS 26+ SDK must adopt UIScene or they refuse to launch:
 *   "Application failed to launch: UIScene life cycle is required for apps built with this SDK."
 * Expo SDK 57 / React Native 0.86 still generate the classic UIWindow AppDelegate, so on
 * Xcode 27 the app installs and then dies immediately. This plugin adds the scene manifest,
 * a SceneDelegate that owns the window, and moves React Native's startup into it.
 *
 * Remove this plugin once Expo's template adopts scenes itself.
 */

const SCENE_DELEGATE = `import UIKit
import React

// Created by the withUIScene config plugin — see plugins/withUIScene.js.
// The iOS 26+ SDK requires scene lifecycle adoption; the window is therefore owned here
// rather than in AppDelegate.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene else { return }

    let window = UIWindow(windowScene: windowScene)
    self.window = window

    if let appDelegate = UIApplication.shared.delegate as? AppDelegate {
      appDelegate.window = window
      appDelegate.startReactNative(in: window)
    }

    window.makeKeyAndVisible()
  }
}
`;

/** Scene manifest pointing at the delegate above. */
function withSceneManifest(config) {
  return withInfoPlist(config, (cfg) => {
    cfg.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
          },
        ],
      },
    };
    return cfg;
  });
}

/**
 * Splits React Native startup out of `didFinishLaunchingWithOptions` into a method the scene
 * delegate calls once it has a window. Starting it in the app delegate would race the scene:
 * the window does not exist yet at that point.
 */
function withSceneAwareAppDelegate(config) {
  return withAppDelegate(config, (cfg) => {
    let contents = cfg.modResults.contents;

    const windowBlock = `#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif`;

    if (contents.includes(windowBlock)) {
      contents = contents.replace(
        windowBlock,
        '    // The SceneDelegate starts React Native once its window exists.',
      );
    }

    if (!contents.includes('func startReactNative(in window: UIWindow)')) {
      const marker = '  // Linking API';
      const method = `  /// Called by SceneDelegate once the scene has provided a window.
  func startReactNative(in window: UIWindow) {
    reactNativeFactory?.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
  }

`;
      contents = contents.includes(marker)
        ? contents.replace(marker, method + marker)
        : contents.replace(/\n}\s*$/, `\n${method}}\n`);
    }

    // Keep the launch options around for the scene to use later.
    if (!contents.includes('var launchOptions:')) {
      contents = contents.replace(
        'var reactNativeDelegate: ExpoReactNativeFactoryDelegate?',
        'var launchOptions: [UIApplication.LaunchOptionsKey: Any]?\n  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?',
      );
      contents = contents.replace(
        '    let delegate = ReactNativeDelegate()',
        '    self.launchOptions = launchOptions\n    let delegate = ReactNativeDelegate()',
      );
    }

    cfg.modResults.contents = contents;
    return cfg;
  });
}

/** Writes SceneDelegate.swift into the iOS project directory. */
function withSceneDelegateFile(config) {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const projectRoot = cfg.modRequest.platformProjectRoot;
      const name = IOSConfig.XcodeUtils.getProjectName(cfg.modRequest.projectRoot);
      const target = path.join(projectRoot, name, 'SceneDelegate.swift');
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, SCENE_DELEGATE);
      return cfg;
    },
  ]);
}

/** Adds SceneDelegate.swift to the Xcode target so it actually compiles. */
function withSceneDelegateInProject(config) {
  return withXcodeProject(config, (cfg) => {
    const name = IOSConfig.XcodeUtils.getProjectName(cfg.modRequest.projectRoot);
    const filePath = `${name}/SceneDelegate.swift`;

    if (!cfg.modResults.hasFile(filePath)) {
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
        filepath: filePath,
        groupName: name,
        project: cfg.modResults,
      });
    }
    return cfg;
  });
}

module.exports = function withUIScene(config) {
  config = withSceneManifest(config);
  config = withSceneAwareAppDelegate(config);
  config = withSceneDelegateFile(config);
  config = withSceneDelegateInProject(config);
  return config;
};
