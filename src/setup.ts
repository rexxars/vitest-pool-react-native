// @env node
import {spawn} from 'node:child_process'
import {cp, mkdir, rename} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {homedir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {lock} from 'proper-lockfile'
import * as android from './android.js'
import * as ios from './simulator.js'
import type {Platform} from './types.js'

const template = new URL('../template/', import.meta.url)
const req = createRequire(import.meta.url)

function run(command: string, args: string[], cwd: string, env = process.env): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {cwd, env, stdio: 'inherit'})
    child.once('error', reject)
    child.once('close', (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} failed (${signal ?? code})`))
    })
  })
}

async function installIOS(app: string, udid: string): Promise<void> {
  const cwd = join(app, 'ios')
  const env = {...process.env, BUNDLE_PATH: 'vendor/bundle'}
  await run('bundle', ['install'], cwd, env)
  await run('bundle', ['exec', 'pod', 'install', '--deployment'], cwd, env)
  await run('xcrun', ['simctl', 'bootstatus', udid, '-b'], cwd)
  await run(
    'xcodebuild',
    [
      '-workspace',
      'PoolConsumer.xcworkspace',
      '-scheme',
      'PoolConsumer',
      '-configuration',
      'Debug',
      '-destination',
      'id=' + udid,
      '-derivedDataPath',
      'build/DerivedData',
      '-quiet',
      'build',
    ],
    cwd,
  )
  await run(
    'xcrun',
    [
      'simctl',
      'install',
      udid,
      'build/DerivedData/Build/Products/Debug-iphonesimulator/PoolConsumer.app',
    ],
    cwd,
  )
}

async function installAndroid(app: string, serial: string): Promise<void> {
  const abi = await android.adb('-s', serial, 'shell', 'getprop', 'ro.product.cpu.abi')
  if (!['arm64-v8a', 'armeabi-v7a', 'x86', 'x86_64'].includes(abi)) {
    throw new Error(`Unsupported Android ABI on ${serial}: ${abi}`)
  }
  const cwd = join(app, 'android')
  const args = [':app:assembleDebug', '-PreactNativeArchitectures=' + abi]
  if (process.platform === 'win32') await run('cmd.exe', ['/d', '/c', 'gradlew.bat', ...args], cwd)
  else await run('./gradlew', args, cwd)
  await android.adb(
    '-s',
    serial,
    'install',
    '-r',
    join(cwd, 'app/build/outputs/apk/debug/app-debug.apk'),
  )
}

function cacheRoot(): string {
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Caches')
  if (process.platform === 'win32')
    return process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local')
  return process.env.XDG_CACHE_HOME || join(homedir(), '.cache')
}

export async function setup(platform: Platform): Promise<void> {
  if (platform === 'ios' && process.platform !== 'darwin')
    throw new Error('iOS setup requires macOS with Xcode.')
  const {version}: {version: string} = req('../package.json')
  const host: {dependencies: {'react-native': string}} = req('../template/package.json')
  const consumer = createRequire(join(process.cwd(), 'package.json'))
  const {version: rn}: {version: string} = consumer('react-native/package.json')
  if (rn !== host.dependencies['react-native']) {
    throw new Error(
      `The included host uses react-native@${host.dependencies['react-native']}, but your project has ${rn}. Install the matching version or configure your own development app.`,
    )
  }
  const work = join(cacheRoot(), 'vitest-pool-react-native', version, platform)
  const device =
    platform === 'ios'
      ? await ios.resolveDevice(process.env.VITEST_IOS_DEVICE)
      : await android.resolveDevice(process.env.VITEST_ANDROID_DEVICE ?? process.env.ANDROID_SERIAL)
  await mkdir(work, {recursive: true})
  const unlock = await lock(work, {stale: 120_000})
  try {
    const releaseDevice =
      typeof device === 'string' ? await android.lockDevice(device) : await ios.lockDevice(device)
    try {
      console.log(`Preparing the React Native ${platform} host in ${work}`)
      await cp(fileURLToPath(template), work, {recursive: true})
      // npm excludes package-lock.json from tarballs. Restore its conventional name in the cache.
      await rename(join(work, 'npm-lock.json'), join(work, 'package-lock.json'))
      const args = ['ci', '--include=dev', '--no-audit', '--no-fund']
      if (process.platform === 'win32') await run('cmd.exe', ['/d', '/c', 'npm.cmd', ...args], work)
      else await run('npm', args, work)
      if (typeof device === 'string') await installAndroid(work, device)
      else await installIOS(work, device.udid)
      console.log(
        `Installed on ${typeof device === 'string' ? device : device.name}. Run vitest run --project ${platform}.`,
      )
    } finally {
      await releaseDevice()
    }
  } finally {
    await unlock()
  }
}
