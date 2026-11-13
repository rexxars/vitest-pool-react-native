import type {Platform} from 'react-native'

export interface NativePlatformModule {
  getConstants(): {
    reactNativeVersion: typeof Platform.constants.reactNativeVersion
    Fingerprint?: string
    systemName?: string
  }
}
