# Contributing

Use Node 24.11+ on the 24.x line and npm. Run `npm ci`, then `npm run check` to format-check, lint, type-check, build and run the Node tests. Use `npm run format` to apply formatting.

For a change to the runner, run `npm run test:package -- ios` or `npm run test:package -- android` with the prerequisites in the README. This packs the module, installs it in a temporary library project, builds the native host and runs the tests through the public entry points. Pass a Vitest version as the second argument to exercise another supported minor.

When changing the host's JavaScript dependencies, run `npm install --package-lock-only` in `template` with `npm-lock.json` renamed to `package-lock.json`. Rename it back before committing. npm omits files named `package-lock.json` from tarballs. Keep the Ruby, CocoaPods and Gradle inputs in sync with the native build.

For a user-facing change, run `npx changeset` and describe it from a library author's perspective. On main, the release workflow runs CI and opens or updates a version PR. Merging that PR publishes the version to npm and creates a GitHub release. Check the package's repository URL and configure npm trusted publishing for the repository's `release.yml` workflow before enabling releases. Enable GitHub Actions to create pull requests in the repository settings.
