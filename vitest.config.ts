// @env node
import {defineConfig} from 'vitest/config'
import {androidPool, iosPool} from 'vitest-pool-react-native'

const native = {include: ['tests/**/*.{test,spec}.{js,jsx,ts,tsx}'], maxWorkers: 1}

export default defineConfig({
  test: {
    projects: [
      {test: {name: 'node', include: ['tests/exports.test.ts']}},
      {test: {name: 'ios', pool: iosPool(), ...native}},
      {test: {name: 'android', pool: androidPool(), ...native}},
    ],
  },
})
