#!/usr/bin/env bash
set -euo pipefail

if [[ "$APK_CACHE_HIT" == true ]]; then
  echo "Installing the cached React Native host"
  adb -s "$ANDROID_SERIAL" install -r "$HOST_APK"
else
  npm exec --no -- vitest-pool-react-native setup android
fi
npm exec --no -- vitest run --project "$VITEST_PROJECT"
