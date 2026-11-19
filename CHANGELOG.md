# vitest-pool-react-native

## 2.1.1

### Patch Changes

- e5e5e67: Make iOS startup recovery in GitHub Actions more robust. A test file gets up to three startup attempts instead of two, a stalled launch is detected after 60 seconds instead of 120, and `simctl` queries that hang are cut off after 30 seconds and repeated. Restarting a simulator that is already shut down no longer fails.
- 1419e42: Report errors thrown while a test file or helper loads. React Native's module loader swallowed them, so they appeared as a timeout on Android or as an undefined import on iOS. The run now fails with the original error.

## 2.1.0

### Minor Changes

- 30d52ec: Support Vitest's `inject`. Values from `provide` in the Vitest config or `globalSetup` are available in test files and listed test helpers on the device.

## 2.0.0

### Major Changes

- 41f6b1f: First stable release. The package version jumps from 0.1.0 to 2.0.0 because 1.0.0 was published and removed from npm earlier, and npm does not allow reusing a version number.

### Minor Changes

- 9302c27: Use React Native's prebuilt iOS binaries when building the simulator host, so setup only compiles the small host app. Pass `--from-source` to `setup ios` (or `from-source: true` to the iOS action) to compile React Native from source as before.

## 0.1.0

### Minor Changes

- 60f48a2: Run shared Vitest tests in Hermes on iOS and Android. The setup command builds and installs a native host for library projects.

### Patch Changes

- c31e909: Run multiple test files or projects on one device without setting `maxWorkers: 1`. The pool queues test files by device.
- e4bbff7: Recover once from an unresponsive iOS simulator during startup in GitHub Actions. If a test file times out, report whether the app reached the development server, requested its bundle or sent a runner event.
