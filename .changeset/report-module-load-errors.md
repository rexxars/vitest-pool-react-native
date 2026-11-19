---
'vitest-pool-react-native': patch
---

Report errors thrown while a test file or helper loads. React Native's module loader swallowed them, so they appeared as a timeout on Android or as an undefined import on iOS. The run now fails with the original error.
