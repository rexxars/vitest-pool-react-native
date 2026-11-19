// @env node
import {runInNewContext} from 'node:vm'
import {expect, test, vi} from 'vitest'
import {entry} from '../src/entry.js'

type Handler = (error: unknown, isFatal?: boolean) => void

function run() {
  const handlers: Handler[] = []
  const previous = vi.fn()
  const fetch = vi.fn(async (_url: string, _init: {method: string; body: string}) => ({ok: true}))
  runInNewContext(
    entry({
      appName: 'PoolConsumer',
      platform: 'android',
      method: 'run',
      endpoint: 'http://127.0.0.1:1234/result',
      modules: [],
    }),
    {
      fetch,
      setTimeout: () => 0,
      require: () => ({AppRegistry: {registerComponent() {}}}),
      ErrorUtils: {
        getGlobalHandler: () => previous,
        setGlobalHandler: (handler: Handler) => handlers.push(handler),
      },
    },
  )
  return {handler: handlers[0], previous, fetch}
}

test('sends fatal errors, such as a module that throws while loading, to the host', () => {
  const {handler, previous, fetch} = run()
  handler?.(new ReferenceError('EventTarget is not defined'), true)
  expect(fetch).toHaveBeenCalledOnce()
  expect(fetch).toHaveBeenCalledWith(
    'http://127.0.0.1:1234/result/error',
    expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('ReferenceError: EventTarget is not defined'),
    }),
  )
  expect(previous).not.toHaveBeenCalled()
})

test('leaves non-fatal errors to the previous handler', () => {
  const {handler, previous, fetch} = run()
  const error = new Error('logged by React Native')
  handler?.(error, false)
  expect(previous).toHaveBeenCalledWith(error, false)
  expect(fetch).not.toHaveBeenCalled()
})
