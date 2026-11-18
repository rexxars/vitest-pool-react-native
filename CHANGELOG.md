# vitest-pool-react-native

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
