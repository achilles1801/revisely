// The UIKit scene life cycle (UIScene), which the iOS 27 SDK requires: an app
// built with Xcode 27 that doesn't adopt it crashes at launch on iOS 27
// (_UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption). Expo adopts
// it from SDK 58; on SDK 54 this plugin does what Expo's ExpoAppSceneDelegate
// does there (https://expo.fyi/ios-scene-lifecycle):
//
// - Info.plist declares one window scene, delegate `SceneDelegate`.
// - AppDelegate still makes the window at launch (expo-dev-launcher looks for it
//   in didFinishLaunching). Release builds no longer start React Native there:
//   SceneDelegate puts the window on the scene and starts React Native in it,
//   with the URL the app was opened with as its launch option (React Native's
//   Linking.getInitialURL reads it: the widgets' revisely:// links).
// - Development builds still start it at launch: expo-dev-launcher (debug only)
//   prepares itself when React Native starts and throws in didFinishLaunching
//   otherwise. SceneDelegate then only moves the window onto the scene.
// - URLs, user activities and the active/background callbacks, which UIKit now
//   sends to the scene, go back through AppDelegate (ExpoAppDelegate), so its
//   overrides and Expo's subscribers get them as before.
//
// It must run after @react-native-firebase/app's AppDelegate change, which
// anchors on `factory.startReactNative(`: list it before that plugin (mods run
// in reverse order). Prebuild fails here if the template changes under it.

const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

const START = /\n([ \t]*)factory\.startReactNative\(\s*withModuleName:\s*"main",\s*in:\s*window,\s*launchOptions:\s*launchOptions\)\n/;
const MARK = '// revisely: SceneDelegate';

const SCENE_DELEGATE = `
${MARK} (plugins/withSceneDelegate.js): the window scene's delegate.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  private var appDelegate: AppDelegate? { UIApplication.shared.delegate as? AppDelegate }

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene, let appDelegate = appDelegate else { return }
    // The window AppDelegate made at launch, now on this scene.
    let window = appDelegate.window ?? UIWindow(windowScene: windowScene)
    window.windowScene = windowScene
    window.frame = windowScene.coordinateSpace.bounds
    appDelegate.window = window
    self.window = window

    if window.rootViewController != nil {
      // A development build: React Native started at launch (expo-dev-launcher).
      window.makeKeyAndVisible()
    } else {
      // A URL the app was opened with used to come in launchOptions.
      var launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
      if let context = connectionOptions.urlContexts.first {
        launchOptions = [.url: context.url]
        if let source = context.options.sourceApplication { launchOptions?[.sourceApplication] = source }
      }
      appDelegate.reactNativeFactory?.startReactNative(
        withModuleName: "main",
        in: window,
        launchOptions: launchOptions)
    }

    // And as events, for Expo's subscribers (expo-linking, the dev launcher).
    if !connectionOptions.urlContexts.isEmpty {
      self.scene(scene, openURLContexts: connectionOptions.urlContexts)
    }
    for activity in connectionOptions.userActivities {
      self.scene(scene, continue: activity)
    }
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    guard let appDelegate = appDelegate else { return }
    for context in URLContexts {
      var options: [UIApplication.OpenURLOptionsKey: Any] = [.openInPlace: context.options.openInPlace]
      if let source = context.options.sourceApplication { options[.sourceApplication] = source }
      if let annotation = context.options.annotation { options[.annotation] = annotation }
      _ = appDelegate.application(UIApplication.shared, open: context.url, options: options)
    }
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    _ = appDelegate?.application(UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
  }

  func sceneDidBecomeActive(_ scene: UIScene) {
    appDelegate?.applicationDidBecomeActive(UIApplication.shared)
  }

  func sceneWillResignActive(_ scene: UIScene) {
    appDelegate?.applicationWillResignActive(UIApplication.shared)
  }

  func sceneWillEnterForeground(_ scene: UIScene) {
    appDelegate?.applicationWillEnterForeground(UIApplication.shared)
  }

  func sceneDidEnterBackground(_ scene: UIScene) {
    appDelegate?.applicationDidEnterBackground(UIApplication.shared)
  }
}
`;

/** The AppDelegate.swift change, on its own (tested in plugins/__tests__). */
function withSceneAppDelegate(contents) {
  if (contents.includes(MARK)) return contents;
  if (!START.test(contents)) {
    throw new Error(
      'withSceneDelegate: AppDelegate.swift no longer starts React Native with `factory.startReactNative(withModuleName: "main", in: window, launchOptions: launchOptions)`. Update plugins/withSceneDelegate.js for the new template (SDK 58 adopts scenes itself: remove the plugin then).',
    );
  }
  const started = contents.replace(
    START,
    (_, indent) =>
      `\n#if DEBUG\n${indent}// Development builds: expo-dev-launcher needs React Native started here;\n` +
      `${indent}// SceneDelegate then moves this window onto the scene.\n` +
      `${indent}factory.startReactNative(\n${indent}  withModuleName: "main",\n${indent}  in: window,\n${indent}  launchOptions: launchOptions)\n#endif\n` +
      `${indent}// Release builds: React Native starts in SceneDelegate, on the window scene (the UIScene life cycle).\n`,
  );
  return `${started.trimEnd()}\n${SCENE_DELEGATE}`;
}

const SCENE_MANIFEST = {
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

function withSceneDelegate(config) {
  config = withInfoPlist(config, (c) => {
    c.modResults.UIApplicationSceneManifest = SCENE_MANIFEST;
    return c;
  });
  return withAppDelegate(config, (c) => {
    if (c.modResults.language !== 'swift') {
      throw new Error('withSceneDelegate: expected a Swift AppDelegate.');
    }
    c.modResults.contents = withSceneAppDelegate(c.modResults.contents);
    return c;
  });
}

module.exports = withSceneDelegate;
module.exports.withSceneAppDelegate = withSceneAppDelegate;
module.exports.SCENE_MANIFEST = SCENE_MANIFEST;
