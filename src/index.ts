// @env node
import type {PoolRunnerInitializer} from 'vitest/node'
import * as android from './android.js'
import {appId, appName, idleTimeout} from './constants.js'
import type {AndroidPoolOptions, IOSPoolOptions} from './types/options.js'
import * as ios from './simulator.js'
import type {DeviceDriver, Platform, PoolConfig} from './types.js'
import {NativeWorker} from './worker.js'

export type {AndroidPoolOptions, IOSPoolOptions} from './types/options.js'

function nativePool<Device>(
  platform: Platform,
  driver: DeviceDriver<Device>,
  options: PoolConfig,
): PoolRunnerInitializer {
  const settings = {
    ...options,
    appName: options.appName ?? appName,
    idleTimeout: options.idleTimeout ?? idleTimeout,
  }
  return {
    name: 'react-native-' + platform,
    createPoolWorker: (context) => new NativeWorker(context, platform, driver, settings),
  }
}

export function iosPool(options: IOSPoolOptions = {}): PoolRunnerInitializer {
  return nativePool('ios', ios, {
    device: process.env.VITEST_IOS_DEVICE,
    ...options,
    appId: options.bundleId ?? appId,
  })
}

export function androidPool(options: AndroidPoolOptions = {}): PoolRunnerInitializer {
  const {metroPort} = options
  if (
    metroPort !== undefined &&
    (!Number.isInteger(metroPort) || metroPort < 1 || metroPort > 65535)
  ) {
    throw new Error('Android metroPort must be an integer between 1 and 65535')
  }
  return nativePool('android', android, {
    device: process.env.VITEST_ANDROID_DEVICE ?? process.env.ANDROID_SERIAL,
    ...options,
    appId: options.applicationId ?? appId,
  })
}
