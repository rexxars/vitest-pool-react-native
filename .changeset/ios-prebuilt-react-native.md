---
'vitest-pool-react-native': minor
---

Use React Native's prebuilt iOS binaries when building the simulator host, so setup only compiles the small host app. Pass `--from-source` to `setup ios` (or `from-source: true` to the iOS action) to compile React Native from source as before.
