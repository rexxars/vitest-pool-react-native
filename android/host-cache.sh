#!/usr/bin/env bash
set -euo pipefail

if [[ "$RUNNER_OS/$RUNNER_ARCH" != Linux/X64 ]]; then
  echo "Run the Android action on an x64 Linux runner with KVM (for example, ubuntu-latest)." >&2
  exit 1
fi

manifest=$(node -p "require.resolve('vitest-pool-react-native/package.json')")
rn=$(node -p "require('react-native/package.json').version")
cd "$(dirname "$manifest")"
version=$(node -p "require('./package.json').version")
expected=$(node -p "require('./template/package.json').dependencies['react-native']")
if [[ "$rn" != "$expected" ]]; then
  echo "The installed host uses react-native@$expected, but your project has $rn." >&2
  exit 1
fi

# Hash the installed package's build inputs, including unpublished tarballs with the same version.
digest=$({
  sha256sum dist/setup.js template/{package.json,npm-lock.json,index.js}
  find template/android -type f -print0 | sort -z | xargs -0 sha256sum
} | sha256sum | cut -d' ' -f1)
cache_root=${XDG_CACHE_HOME:-"$HOME/.cache"}
echo "key=vitest-pool-react-native-apk-v1-x86_64-$version-$digest" >> "$GITHUB_OUTPUT"
echo "apk=$cache_root/vitest-pool-react-native/$version/android/android/app/build/outputs/apk/debug/app-debug.apk" >> "$GITHUB_OUTPUT"
