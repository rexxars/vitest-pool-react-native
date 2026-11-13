# vitest-pool-react-native

Run your library's Vitest tests in React Native, on Hermes. Add an iOS or Android project alongside your existing Vitest projects and point it at the same test files.

> [!WARNING]
> This is an early attempt. I've only tested it with a few libraries so far. If you try it, please leave a comment with the library, the platform you tried, and what worked or failed. If you're using a coding agent to run the tests, ask it to report the result in the same thread. [Library compatibility reports](https://github.com/rexxars/vitest-pool-react-native/issues/1)

This is primarily for library authors. Say your package has a `react-native` export and a `.ios.ts` implementation. Metro picks the files an iOS consumer would get, then the simulator runs the resulting bundle. An accidental import of `node:fs` fails during bundling. A call to a missing runtime API fails in Hermes. Both show up in Vitest.

> [!WARNING]
> I wrote this to catch React Native compatibility issues in my own libraries. I don't use React Native myself and I'm not affiliated with either React Native or Vitest. I maintain this in my spare time on a best-effort basis. Testing a full React Native app is outside the current scope.

## Installation

Until the first npm release, build a tarball from this repository. Run the following in a checkout using Node 24.11+ on the 24.x line. `npm pack` builds the pool and prints the tarball filename.

```sh
npm ci
npm pack
```

Then, in the project that runs your library's tests, install that tarball and its peers as dev dependencies. Replace the path below with the path to the file you just built.

```sh
npm install -D /path/to/vitest-pool-react-native-0.0.1.tgz vitest@~5.1.0 react@19.1.0 react-native@0.81.5 @react-native/metro-config@0.81.5 metro@~0.83.8
```

To run your tests, use Node 22.12+ on the 22.x line, 24.x, or 26+. The pool supports Vitest 5.0.x and 5.1.x. The included native host uses React Native 0.81.5. Build your library first if its exports point at generated files.

## Add a Vitest project

In `vitest.config.ts`, use the same `include` pattern you'd normally use for your library. Keep whichever platforms you want to run.

```ts
import {defineConfig} from 'vitest/config'
import {androidPool, iosPool} from 'vitest-pool-react-native'

const include = ['test/**/*.test.ts']

export default defineConfig({
  test: {
    projects: [
      {test: {name: 'node', include}},
      {test: {name: 'ios', include, pool: iosPool(), maxWorkers: 1}},
      {test: {name: 'android', include, pool: androidPool(), maxWorkers: 1}},
    ],
  },
})
```

Import `test`, `expect` and hooks from `vitest` as usual. Tests that import your source by relative path exercise that source. To check the package entry points your users get, install your library's `npm pack` tarball in a test project and import it by package name.

## Set up a device

Run setup once per device, and again when you update the pool's native host. It builds a small development app in your user cache and installs it on the selected device. There's nothing to scaffold in your repository. Subsequent JavaScript changes only need a Vitest run.

### iOS

On macOS, install Xcode with an iPhone simulator runtime, and Ruby 3.2+ with Bundler. Setup installs the locked gems and CocoaPods dependencies and boots the simulator.

```sh
npx vitest-pool-react-native setup ios
npx vitest run --project ios
```

Both commands prefer a booted iPhone. To choose another simulator, set `VITEST_IOS_DEVICE` to its name or UDID from `xcrun simctl list devices available`.

### Android

Set `JAVA_HOME` to JDK 17 or 21 and `ANDROID_HOME` to your Android SDK. Install Platform Tools, SDK Platform 36, Build Tools 36.0.0, NDK 27.1.12297006 and CMake 3.22.1. Start an emulator or connect an authorized device running Android API 24 or newer.

```sh
npx vitest-pool-react-native setup android
npx vitest run --project android
```

If `adb devices` lists several devices, set `VITEST_ANDROID_DEVICE` (or `ANDROID_SERIAL`) before running either command. Leave port 8081 free for the default host. The pool serves the bundle and sets up the device's port forwarding.

## What runs where?

Vitest selects the files and reports the results on your computer. For each file, the pool starts a fresh app process. Metro bundles the test, its setup files and your library for the selected platform. It uses your project's Metro config if you have one, or the standard React Native config otherwise.

Only the test's `vitest` import goes through a private runner bundle. Your library sees the globals React Native provides. The pool supports ordinary tests, hooks, asynchronous assertions and filtering by file or test name. Use another Vitest project for tests that rely on `vi` (including mocks and fake timers), snapshots, Vite transforms or coverage. The pool doesn't provide UI automation.

## Configuration

Both `iosPool()` and `androidPool()` accept these options:

| Option        | When to use it                                                                                                                                             |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `device`      | Select a simulator by UDID or name, or an Android device by ADB serial. Use the corresponding environment variable to select the same device during setup. |
| `metroConfig` | Load a specific Metro config, relative to the Vitest project root.                                                                                         |
| `testHelpers` | List test-only helper files or directories that also import `vitest`, relative to the project root. Tests and setup files are included automatically.      |
| `idleTimeout` | Change how long the pool waits between reports from the device. Defaults to 120000 ms.                                                                     |

### Libraries with native dependencies

The included host contains React Native's built-in native modules. If your library needs another native module, build and install a Hermes-enabled development app with that module and the same React Native version as your tests. Point the pool at it:

```ts
iosPool({bundleId: 'com.example.librarytests', appName: 'LibraryTests'})
androidPool({applicationId: 'com.example.librarytests', appName: 'LibraryTests'})
```

Use the component name your native entry point requests. The app must load the `index` bundle from the development server and permit local HTTP. On iOS, use `RCTBundleURLProvider`. On Android, keep the default debug host or use `localhost:<port>`. If the pool can't read the app's development server port, pass it as `metroPort`.

## License

MIT. The included native project retains the React Native community template's license.
