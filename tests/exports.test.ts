import {describe, expect, test} from 'vitest'
import {entry} from 'runtime-probe'

describe('package exports', () => {
  test('loads the consumer entry for this runtime', async () => {
    const expected = 'HermesInternal' in globalThis ? 'react-native' : 'default'
    await expect(Promise.resolve(entry)).resolves.toBe(expected)
  })

  test.fails('requires async assertions to be awaited', () => {
    expect(Promise.resolve(entry)).resolves.toBe(entry)
  })
})
