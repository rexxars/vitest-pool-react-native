---
'vitest-pool-react-native': patch
---

Make iOS startup recovery in GitHub Actions more robust. A test file gets up to three startup attempts instead of two, a stalled launch is detected after 60 seconds instead of 120, and `simctl` queries that hang are cut off after 30 seconds and repeated. Restarting a simulator that is already shut down no longer fails.
