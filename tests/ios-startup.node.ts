// @env node
import {expect, test, vi} from 'vitest'
import {openBridge} from '../src/bridge.js'
import {DeviceStartupTimeout, startupAttempts, withStartupRecovery} from '../src/startup-timeout.js'

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

test('repeated startup failures are surfaced after the last attempt', async () => {
  const run = vi.fn().mockRejectedValue(new DeviceStartupTimeout('no bundle request'))
  const restart = vi.fn()
  await expect(withStartupRecovery(run, restart, new AbortController().signal)).rejects.toThrow(
    'no bundle request',
  )
  expect(run).toHaveBeenCalledTimes(startupAttempts)
  expect(restart).toHaveBeenCalledTimes(startupAttempts - 1)
})

test('a later attempt can recover, and each restart is told which attempt failed', async () => {
  const run = vi
    .fn()
    .mockRejectedValueOnce(new DeviceStartupTimeout('first stall'))
    .mockRejectedValueOnce(new DeviceStartupTimeout('second stall'))
    .mockResolvedValueOnce(undefined)
  const restart = vi.fn()
  await withStartupRecovery(run, restart, new AbortController().signal)
  expect(run).toHaveBeenCalledTimes(3)
  expect(restart.mock.calls.map(([error, attempt]) => [error.message, attempt])).toEqual([
    ['first stall', 1],
    ['second stall', 2],
  ])
})

test('other failures are not retried', async () => {
  const run = vi.fn().mockRejectedValue(new Error('test file failed'))
  const restart = vi.fn()
  await expect(withStartupRecovery(run, restart, new AbortController().signal)).rejects.toThrow(
    'test file failed',
  )
  expect(run).toHaveBeenCalledOnce()
  expect(restart).not.toHaveBeenCalled()
})

test('the startup limit applies before the bundle request and the idle timeout after it', async () => {
  const early = await openBridge(rpc, new AbortController().signal)
  try {
    early.serve(bundle, 5_000, 'library.test.ts', 100)
    await expect(early.result).rejects.toBeInstanceOf(DeviceStartupTimeout)
    await expect(early.result).rejects.toThrow('timed out after 100 ms')
  } finally {
    await early.close()
  }
  const late = await openBridge(rpc, new AbortController().signal)
  try {
    late.serve(bundle, 400, 'library.test.ts', 100)
    await fetch(new URL('/index.bundle', late.endpoint))
    const result = late.result.catch((error: unknown) => error)
    // Past the 100 ms startup limit, the run still waits for the idle timeout.
    expect(
      await Promise.race([result, new Promise((resolve) => setTimeout(resolve, 250, 'waiting'))]),
    ).toBe('waiting')
    await expect(result).resolves.toMatchObject({
      message: expect.stringContaining('timed out after 400 ms'),
    })
  } finally {
    await late.close()
  }
})

test('cancelling the run while the simulator restarts prevents a second launch', async () => {
  const controller = new AbortController()
  const run = vi.fn().mockRejectedValue(new DeviceStartupTimeout('no bundle request'))
  const restart = async () => controller.abort(new Error('cancelled'))
  await expect(withStartupRecovery(run, restart, controller.signal)).rejects.toThrow('cancelled')
  expect(run).toHaveBeenCalledOnce()
})
