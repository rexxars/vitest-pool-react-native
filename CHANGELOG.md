# vitest-pool-react-native

## 0.1.0

### Minor Changes

- 60f48a2: Run shared Vitest tests in Hermes on iOS and Android. The setup command builds and installs a native host for library projects.

### Patch Changes

- c31e909: Run multiple test files or projects on one device without setting `maxWorkers: 1`. The pool queues test files by device.
