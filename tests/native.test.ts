import {Platform, TurboModuleRegistry} from 'react-native'
import type {NativePlatformModule} from './types.js'
import {resolvedPlatform} from 'runtime-probe'
import {expect, test} from 'vitest'

test('runs in Hermes with the native platform module installed', () => {
  expect(globalThis).toHaveProperty('HermesInternal')
  expect(['ios', 'android']).toContain(Platform.OS)
  expect(resolvedPlatform).toBe(Platform.OS)
  const constants =
    TurboModuleRegistry.getEnforcing<NativePlatformModule>('PlatformConstants').getConstants()
  // These fields come from the OS, independently of Metro's platform choice.
  if (resolvedPlatform === 'android') expect(constants.Fingerprint).toEqual(expect.any(String))
  else expect(constants.systemName).toEqual(expect.any(String))
  expect(constants.reactNativeVersion).toEqual(Platform.constants.reactNativeVersion)
  expect(typeof constants.reactNativeVersion.minor).toBe('number')
})
