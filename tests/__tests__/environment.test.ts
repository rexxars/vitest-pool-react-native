import {expect, test} from 'vitest'
import {entry} from 'runtime-probe'
import {selectedFormat} from 'runtime-probe/format'

test('runs the React Native export with the Hermes host globals', () => {
  expect(entry).toBe('react-native')
  expect(selectedFormat).toBe('import')
  expect(globalThis).not.toHaveProperty('__vitest_worker__')
  expect(globalThis).not.toHaveProperty('expect')
  expect(globalThis).not.toHaveProperty('structuredClone')
  expect(globalThis).not.toHaveProperty('FinalizationRegistry')
  expect(globalThis.process).not.toHaveProperty('memoryUsage')
  expect(globalThis.process?.env).not.toHaveProperty('VITEST_WORKER_ID')
  expect(Object.getOwnPropertySymbols(globalThis)).not.toContain(
    Symbol.for('$$jest-matchers-object'),
  )
})
