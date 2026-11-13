export interface NativePoolOptions {
  /** Component name passed to AppRegistry by the native app. Defaults to PoolConsumer. */
  appName?: string
  /** Path to a Metro config, relative to the Vitest project root. */
  metroConfig?: string
  /** Test-only helper files or directories that import Vitest, relative to the project root. */
  testHelpers?: string[]
  /** Maximum time between device reports in milliseconds. Defaults to 120000. */
  idleTimeout?: number
}

export interface IOSPoolOptions extends NativePoolOptions {
  /** Simulator UDID or exact name. Defaults to VITEST_IOS_DEVICE, then a booted or recently used iPhone. */
  device?: string
  /** Bundle identifier of an installed development app. Defaults to dev.vitest.pool.consumer. */
  bundleId?: string
}

export interface AndroidPoolOptions extends NativePoolOptions {
  /** ADB serial. Defaults to VITEST_ANDROID_DEVICE, then ANDROID_SERIAL, then the sole connected device. */
  device?: string
  /** Application ID of the installed development app. Defaults to dev.vitest.pool.consumer. */
  applicationId?: string
  /** Development server port. By default the pool reads the app's debug host or compiled React Native port. */
  metroPort?: number
}
