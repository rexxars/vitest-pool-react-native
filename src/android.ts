// @env node
import {clearTimeout, setTimeout} from 'node:timers'
import type {Cleanup} from './types.js'
import {appId as defaultAppId} from './constants.js'
import {execFile} from 'node:child_process'
import {createHash} from 'node:crypto'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {promisify} from 'node:util'
import {lock} from 'proper-lockfile'

const exec = promisify(execFile)

export async function adb(...args: string[]): Promise<string> {
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT
  const binary = process.platform === 'win32' ? 'adb.exe' : 'adb'
  const {stdout} = await exec(sdk ? join(sdk, 'platform-tools', binary) : binary, args, {
    timeout: 30_000,
  })
  return stdout.trim()
}

export async function resolveDevice(requested?: string): Promise<string> {
  const listing = await adb('devices')
  const ready = listing
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/))
    .filter(([, state]) => state === 'device')
    .map(([serial]) => serial)
  if (requested && ready.includes(requested)) return requested
  if (!requested && ready.length === 1 && ready[0]) return ready[0]
  throw new Error(
    `Select one connected Android device using VITEST_ANDROID_DEVICE or the device option. Requested: ${requested ?? '(automatic)'}.\n${listing}`,
  )
}

export async function lockDevice(serial: string): Promise<Cleanup> {
  // Wireless ADB serials can contain characters that are invalid in filenames.
  const key = createHash('sha256').update(serial).digest('hex')
  try {
    return await lock(join(tmpdir(), 'vitest-android-' + key), {realpath: false, stale: 120_000})
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ELOCKED')) throw error
    throw new Error(
      `Android device ${serial} is in use. Wait for the other process to finish or select another device.`,
      {cause: error},
    )
  }
}

export async function prepareDevice(
  serial: string,
  appId: string,
  metroPort?: number,
): Promise<number> {
  if (!/^[A-Za-z]\w*(?:\.[A-Za-z]\w*)+$/.test(appId)) {
    throw new Error('Invalid Android applicationId: ' + appId)
  }
  const shell = (...args: string[]) => adb('-s', serial, 'shell', ...args)
  let path
  try {
    path = await shell('pm', 'path', appId)
  } catch (error) {
    // Some Android versions exit 1 with no output for an unknown package.
    if (
      !(
        error instanceof Error &&
        'code' in error &&
        error.code === 1 &&
        'stdout' in error &&
        !error.stdout &&
        'stderr' in error &&
        !error.stderr
      )
    )
      throw error
    path = ''
  }
  if (!path.startsWith('package:')) {
    throw new Error(
      `Install the development test app ${appId} on ${serial} before running the Android pool.${appId === defaultAppId ? ' Run npx vitest-pool-react-native setup android.' : ''}`,
    )
  }
  if (metroPort !== undefined) return metroPort

  // RN reads debug_http_host before the integer resource in the installed APK.
  const prefs = 'shared_prefs/' + appId + '_preferences.xml'
  const setting = await shell(
    'run-as',
    appId,
    'sh',
    '-c',
    `'if [ -f ${prefs} ]; then grep debug_http_host ${prefs} || true; fi'`,
  )
  const host = setting.match(/<string name="debug_http_host">([^<]+)<\/string>/)?.[1]
  if (host && !/^(?:localhost|127\.0\.0\.1|10\.0\.[23]\.2):\d+$/.test(host)) {
    throw new Error(
      `Set the development server for ${appId} to localhost:<port> or clear its debug host setting. Found ${host}.`,
    )
  }
  try {
    const port = Number(
      host
        ? host.split(':')[1]
        : await shell(
            'cmd',
            'overlay',
            'lookup',
            appId,
            appId + ':integer/react_native_dev_server_port',
          ),
    )
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new Error('Invalid port: ' + port)
    return port
  } catch (cause) {
    throw new Error(
      `Couldn't determine the development server port for ${appId}. Pass its port in androidPool({metroPort}).`,
      {cause},
    )
  }
}

async function reversePort(serial: string, port: number): Promise<Cleanup | undefined> {
  const socket = 'tcp:' + port
  const existing = await adb('-s', serial, 'reverse', '--list')
  for (const line of existing.split(/\r?\n/)) {
    const [, remote, local] = line.trim().split(/\s+/)
    if (remote !== socket) continue
    if (local === socket) return // Bootstrap or the user already owns this mapping.
    throw new Error(`Android device ${serial} already forwards ${socket} to ${local}.`)
  }
  await adb('-s', serial, 'reverse', '--no-rebind', socket, socket)
  return async () => {
    await adb('-s', serial, 'reverse', '--remove', socket)
  }
}

export async function launch(
  serial: string,
  appId: string,
  port: number,
  failed: (error: Error) => void,
): Promise<Cleanup> {
  const shell = (...args: string[]) => adb('-s', serial, 'shell', ...args)
  const resolution = await shell(
    'cmd',
    'package',
    'resolve-activity',
    '--brief',
    '-a',
    'android.intent.action.MAIN',
    '-c',
    'android.intent.category.LAUNCHER',
    '-p',
    appId,
  )
  const component = resolution.split(/\r?\n/).at(-1)
  if (!component || !component.startsWith(appId + '/') || !/^[\w.]+\/[\w.]+$/.test(component)) {
    throw new Error(
      `Couldn't resolve the launcher activity of ${appId} on ${serial}:\n${resolution}`,
    )
  }
  const unmap = await reversePort(serial, port)
  let timer: ReturnType<typeof setTimeout> | undefined
  let stopping = false
  async function stop() {
    stopping = true
    clearTimeout(timer)
    try {
      await shell('am', 'force-stop', appId)
    } finally {
      await unmap?.()
    }
  }
  // am start returns once the activity launches. Monitor its process while JS
  // runs, so a native crash surfaces before the bridge's inactivity timeout.
  async function checkProcess() {
    try {
      await shell('pidof', appId)
      if (!stopping) timer = setTimeout(checkProcess, 1000)
    } catch (cause) {
      if (!stopping)
        failed(
          new Error(
            `Lost Android app ${appId} on ${serial}. Check adb -s ${serial} logcat -b crash.`,
            {cause},
          ),
        )
    }
  }
  try {
    await shell('am', 'force-stop', appId)
    const status = await shell('am', 'start', '-W', '-n', component)
    if (!/^Status: ok\s*$/m.test(status))
      throw new Error(`Failed to launch ${appId} on ${serial}:\n${status}`)
    timer = setTimeout(checkProcess, 1000)
    return stop
  } catch (error) {
    try {
      await stop()
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        `Failed to start and clean up ${appId} on ${serial}.`,
        {cause: cleanupError},
      )
    }
    throw error
  }
}
