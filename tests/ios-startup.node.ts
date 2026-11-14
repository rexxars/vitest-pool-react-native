// @env node
import {expect, test, vi} from 'vitest'
import {openBridge} from '../src/bridge.js'
import {DeviceStartupTimeout, withStartupRecovery} from '../src/startup-timeout.js'

const bundle = {
  code: '/* test bundle */',
  map: '{"version":3,"sources":[],"names":[],"mappings":""}',
}
const rpc = {onQueued: vi.fn(), onCollected: vi.fn(), onTaskUpdate: vi.fn()}

test('a status request alone permits recovery and the expired bridge cannot serve test code', async () => {
  const bridge = await openBridge(rpc, new AbortController().signal)
  const url = new URL('/index.bundle', bridge.endpoint)
  try {
    bridge.serve(bundle, 500, 'library.test.ts')
    await fetch(new URL('/status', url))
    await expect(bridge.result).rejects.toBeInstanceOf(DeviceStartupTimeout)
    await expect(bridge.result).rejects.toThrow('waiting for the bundle request')
    expect((await fetch(url)).status).toBe(404)
  } finally {
    await bridge.close()
  }
})

test('a timeout after the app requests the bundle preserves the failure', async () => {
  const {signal} = new AbortController()
  const bridge = await openBridge(rpc, signal)
  const restart = vi.fn()
  try {
    bridge.serve(bundle, 500, 'library.test.ts')
    expect(await (await fetch(new URL('/index.bundle', bridge.endpoint))).text()).toBe(bundle.code)
    await expect(withStartupRecovery(() => bridge.result, restart, signal)).rejects.toThrow(
      'the bundle was requested, waiting for the first runner report',
    )
    expect(restart).not.toHaveBeenCalled()
  } finally {
    await bridge.close()
  }
})

test('a second startup failure is surfaced without another restart', async () => {
  const run = vi.fn().mockRejectedValue(new DeviceStartupTimeout('no bundle request'))
  const restart = vi.fn()
  await expect(withStartupRecovery(run, restart, new AbortController().signal)).rejects.toThrow(
    'no bundle request',
  )
  expect(run).toHaveBeenCalledTimes(2)
  expect(restart).toHaveBeenCalledOnce()
})

test('cancelling the run while the simulator restarts prevents a second launch', async () => {
  const controller = new AbortController()
  const run = vi.fn().mockRejectedValue(new DeviceStartupTimeout('no bundle request'))
  const restart = async () => controller.abort(new Error('cancelled'))
  await expect(withStartupRecovery(run, restart, controller.signal)).rejects.toThrow('cancelled')
  expect(run).toHaveBeenCalledOnce()
})
