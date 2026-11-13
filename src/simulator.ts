// @env node
import type {Simulator, Cleanup} from './types.js'
import {appId as defaultAppId} from './constants.js'
import {execFile, spawn} from 'node:child_process'
import {unlink} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {promisify} from 'node:util'

const exec = promisify(execFile)
async function simctl(...args: string[]): Promise<string> {
  const {stdout} = await exec('xcrun', ['simctl', ...args], {timeout: 120_000})
  return stdout
}

export async function resolveDevice(requested?: string): Promise<Simulator> {
  const {devices}: {devices: Record<string, Simulator[]>} = JSON.parse(
    await simctl('list', 'devices', 'available', '--json'),
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
  await simctl('bootstatus', device.udid, '-b')
  try {
    await simctl('get_app_container', device.udid, bundleId, 'app')
  } catch (cause) {
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
): Cleanup {
  const child = spawn(
    'xcrun',
    [
      'simctl',
      'launch',
      '--console',
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
  return async () => {
    // simctl --console forwards SIGTERM to the app it launched.
    child.kill('SIGTERM')
    await closed
  }
}

// macOS shlock atomically claims a PID lock and recovers it after a host crash.
export async function lockDevice(device: Simulator): Promise<Cleanup> {
  const file = join(tmpdir(), 'vitest-ios-' + device.udid + '.lock')
  try {
    await exec('/usr/bin/shlock', ['-p', String(process.pid), '-f', file])
  } catch (cause) {
    throw new Error(
      `iOS simulator ${device.name} is in use. Use maxWorkers: 1, or select another simulator.`,
      {cause},
    )
  }
  return () => unlink(file)
}
