// @env node
import {defineConfig} from 'vitest/config'
import {androidPool, iosPool} from 'vitest-pool-react-native'

const native = {
  include: ['tests/**/*.{test,spec}.{js,jsx,ts,tsx}'],
  provide: {poolProbe: {message: 'from the host', count: 2}},
}

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          include: ['tests/exports.test.ts', 'tests/ios-startup.node.ts', 'tests/entry.node.ts'],
        },
      },
      {test: {name: 'ios', pool: iosPool(), ...native}},
      {test: {name: 'android', pool: androidPool(), ...native}},
    ],
  },
})
