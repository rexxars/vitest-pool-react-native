// @env node
import type {Simulator, Cleanup, StopApp} from './types.js'
import {appId as defaultAppId} from './constants.js'
import {execFile, spawn} from 'node:child_process'
import {unlink} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {promisify} from 'node:util'
import {DeviceStartupTimeout} from './startup-timeout.js'

const exec = promisify(execFile)
// Booting a simulator can take minutes on a CI runner. Queries return immediately when the
// simulator service is healthy, so a short limit finds a wedged one sooner.
const bootTimeout = 120_000
const queryTimeout = 30_000
async function simctl(timeout: number, ...args: string[]): Promise<string> {
  try {
    const {stdout} = await exec('xcrun', ['simctl', ...args], {timeout, killSignal: 'SIGKILL'})
    return stdout
  } catch (cause) {
    if (cause instanceof Error && 'killed' in cause && cause.killed) {
      throw new DeviceStartupTimeout(
        `simctl ${args.join(' ')} did not respond within ${timeout} ms`,
        {
          cause,
        },
      )
    }
    throw cause
  }
}
// A killed simctl command makes the next one restart the stuck simulator service, so a repeat
// usually succeeds.
async function simctlQuery(...args: string[]): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await simctl(queryTimeout, ...args)
    } catch (error) {
      if (!(error instanceof DeviceStartupTimeout) || attempt >= 3) throw error
    }
  }
}

export async function restartDevice(device: Simulator): Promise<void> {
  // prepareDevice boots the same simulator again, keeping the installed host. A simulator that
  // is already shut down, or too stuck to answer, makes this fail. Booting it again reports
  // whether that mattered.
  await simctl(queryTimeout, 'shutdown', device.udid).catch(() => {})
}

export async function resolveDevice(requested?: string): Promise<Simulator> {
  const {devices}: {devices: Record<string, Simulator[]>} = JSON.parse(
    await simctlQuery('list', 'devices', 'available', '--json'),
  )
  const ios = Object.entries(devices)
    .filter(([name]) => name.includes('SimRuntime.iOS-'))
    .flatMap(([, list]) => list)
  const candidates = requested
    ? ios.filter((device) => device.udid === requested || device.name === requested)
    : ios.filter((device) => device.name.startsWith('iPhone'))
  candidates.sort(
    (a, b) =>
      Number(b.state === 'Booted') - Number(a.state === 'Booted') ||
      (b.lastUsedAt ?? '').localeCompare(a.lastUsedAt ?? ''),
  )
  if (!candidates[0])
    throw new Error('No available iOS simulator matching ' + (requested ?? 'iPhone'))
  return candidates[0]
}

export async function prepareDevice(device: Simulator, bundleId: string): Promise<void> {
  // -b boots a shutdown simulator and waits for startup to finish.
  await simctl(bootTimeout, 'bootstatus', device.udid, '-b')
  try {
    await simctl(queryTimeout, 'get_app_container', device.udid, bundleId, 'app')
  } catch (cause) {
    if (cause instanceof DeviceStartupTimeout) throw cause
    throw new Error(
      `Install the development test app ${bundleId} on ${device.name} (${device.udid}) before running the iOS pool.${bundleId === defaultAppId ? ' Run npx vitest-pool-react-native setup ios.' : ''}`,
      {cause},
    )
  }
}

export function launch(
  device: Simulator,
  bundleId: string,
  port: number,
  failed: (error: Error) => void,
): StopApp {
  const child = spawn(
    'xcrun',
    [
      'simctl',
      'launch',
      '--console',
      '--terminate-running-process',
      device.udid,
      bundleId,
      '-RCT_jsLocation',
      '127.0.0.1:' + port,
    ],
    {stdio: ['ignore', 'pipe', 'pipe']},
  )
  let tail = ''
  const capture = (chunk: Buffer) => {
    tail = (tail + chunk.toString()).slice(-8192)
  }
  child.stdout.on('data', capture)
  child.stderr.on('data', capture)
  child.once('error', failed)
  const closed = new Promise<void>((resolve) =>
    child.once('close', (code, signal) => {
      failed(new Error(`iOS app exited before reporting completion (${signal ?? code}).\n${tail}`))
      resolve()
    }),
  )
  return async (reportDiagnostics) => {
    // simctl --console forwards SIGTERM to the app it launched.
    child.kill('SIGTERM')
    const kill = setTimeout(() => child.kill('SIGKILL'), 5000)
    try {
      await closed
    } finally {
      clearTimeout(kill)
      if (reportDiagnostics)
        console.warn(
          `[react-native-ios] ${device.name} (${device.udid}), ${bundleId}: ${tail.trim() || 'simctl launch produced no console output'}`,
        )
    }
  }
}

// macOS shlock atomically claims a PID lock and recovers it after a host crash.
export async function lockDevice(device: Simulator): Promise<Cleanup> {
  const file = join(tmpdir(), 'vitest-ios-' + device.udid + '.lock')
  try {
    await exec('/usr/bin/shlock', ['-p', String(process.pid), '-f', file])
  } catch (cause) {
    throw new Error(
      `iOS simulator ${device.name} is in use. Wait for the other process to finish or select another simulator.`,
      {cause},
    )
  }
  return () => unlink(file)
}
