const { withSceneAppDelegate, SCENE_MANIFEST } = require('../withSceneDelegate');

// AppDelegate.swift as SDK 54's template and @react-native-firebase/app-check
// leave it (prebuild, Oct 29 2026).
const TEMPLATE = `import Expo
import FirebaseCore
import React
import ReactAppDependencyProvider

@UIApplicationMain
public class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory
    bindReactNativeFactory(factory)

#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
// @generated begin @react-native-firebase/app-check - expo prebuild (DO NOT MODIFY) sync-cf2eb2cc4ab0c44de03d7c0dddc7165fa89d986f
RNFBAppCheckModule.sharedInstance()
    FirebaseApp.configure()
// @generated end @react-native-firebase/app-check
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}

class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {
}
`;

const didFinishLaunching = (swift) => swift.slice(swift.indexOf('didFinishLaunchingWithOptions'), swift.indexOf('return super.application'));
const sceneDelegate = (swift) => swift.slice(swift.indexOf('class SceneDelegate'));

describe('withSceneDelegate (the UIScene life cycle, for the iOS 27 SDK)', () => {
  it('release builds start React Native in SceneDelegate, development builds at launch; Firebase configures at launch', () => {
    const out = withSceneAppDelegate(TEMPLATE);
    const launch = didFinishLaunching(out);
    // At launch only under DEBUG (expo-dev-launcher, which is debug-only, needs it).
    expect(launch).toMatch(/#if DEBUG[\s\S]*factory\.startReactNative\([\s\S]*#endif/);
    expect(launch.replace(/#if DEBUG[\s\S]*?#endif/, '')).not.toContain('startReactNative');
    expect(launch).toContain('FirebaseApp.configure()');
    expect(launch.indexOf('FirebaseApp.configure()')).toBeLessThan(launch.indexOf('#if DEBUG'));
    // expo-dev-launcher looks for the app delegate's window in didFinishLaunching.
    expect(launch).toContain('window = UIWindow(frame: UIScreen.main.bounds)');
    const scene = sceneDelegate(out);
    expect(scene).toContain('class SceneDelegate: UIResponder, UIWindowSceneDelegate');
    expect(scene).toMatch(/window\.windowScene = windowScene/);
    // Started there unless the window already has React Native (a development build).
    expect(scene).toMatch(/if window\.rootViewController != nil \{\s*\/\/[^\n]*\n\s*window\.makeKeyAndVisible\(\)\s*\} else \{/);
    expect(scene).toMatch(/reactNativeFactory\?\.startReactNative\(\s*withModuleName: "main",\s*in: window,\s*launchOptions: launchOptions\)/);
    expect(out.match(/startReactNative\(/g)).toHaveLength(2);
  });

  it('a URL the app is opened with reaches React Native as a launch option, and as an event', () => {
    const scene = sceneDelegate(withSceneAppDelegate(TEMPLATE));
    expect(scene).toContain('launchOptions = [.url: context.url]');
    expect(scene).toContain('self.scene(scene, openURLContexts: connectionOptions.urlContexts)');
  });

  it('URLs, user activities and the active/background callbacks go back through AppDelegate', () => {
    const scene = sceneDelegate(withSceneAppDelegate(TEMPLATE));
    expect(scene).toContain('appDelegate.application(UIApplication.shared, open: context.url, options: options)');
    expect(scene).toContain('appDelegate?.application(UIApplication.shared, continue: userActivity');
    for (const [sceneEvent, appEvent] of [
      ['sceneDidBecomeActive', 'applicationDidBecomeActive'],
      ['sceneWillResignActive', 'applicationWillResignActive'],
      ['sceneWillEnterForeground', 'applicationWillEnterForeground'],
      ['sceneDidEnterBackground', 'applicationDidEnterBackground'],
    ]) {
      expect(scene).toMatch(new RegExp(`func ${sceneEvent}\\(_ scene: UIScene\\) \\{\\s*appDelegate\\?\\.${appEvent}\\(UIApplication\\.shared\\)`));
    }
  });

  it('runs once (a second prebuild pass changes nothing)', () => {
    const once = withSceneAppDelegate(TEMPLATE);
    expect(withSceneAppDelegate(once)).toBe(once);
  });

  it('fails prebuild when the template no longer starts React Native as expected', () => {
    expect(() => withSceneAppDelegate(TEMPLATE.replace(/factory\.startReactNative\([\s\S]*?\)\n/, ''))).toThrow(/withSceneDelegate/);
  });

  it('declares one window scene whose delegate is SceneDelegate in the app module', () => {
    expect(SCENE_MANIFEST.UIApplicationSupportsMultipleScenes).toBe(false);
    expect(SCENE_MANIFEST.UISceneConfigurations.UIWindowSceneSessionRoleApplication).toEqual([
      { UISceneConfigurationName: 'Default Configuration', UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate' },
    ]);
  });
});
