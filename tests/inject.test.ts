import {expect, inject, test} from 'vitest'

declare module 'vitest' {
  interface ProvidedContext {
    poolProbe: {message: string; count: number}
  }
}

test('reads values provided by the Vitest config on the device', () => {
  expect(inject('poolProbe')).toEqual({message: 'from the host', count: 2})
})
