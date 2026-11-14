// @env node
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {appendFile, readdir, readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {homedir} from 'node:os'
import {dirname, join} from 'node:path'
import {pathToFileURL} from 'node:url'

if (process.platform !== 'darwin')
  throw new Error('Run the iOS action on a macOS runner with Xcode.')
const consumer = createRequire(join(process.cwd(), 'package.json'))
const manifest = consumer.resolve('vitest-pool-react-native/package.json')
const root = dirname(manifest)
const {version} = consumer(manifest)
const rn = consumer('react-native/package.json').version
const expected = consumer(join(root, 'template/package.json')).dependencies['react-native']
if (rn !== expected)
  throw new Error(`The installed host uses react-native@${expected}, but your project has ${rn}.`)

const {resolveDevice} = await import(pathToFileURL(join(root, 'dist/simulator.js')).href)
const {udid} = await resolveDevice(process.env.VITEST_IOS_DEVICE)
const digest = createHash('sha256')
digest.update(execFileSync('xcodebuild', ['-version']))
digest.update(execFileSync('xcrun', ['--sdk', 'iphonesimulator', '--show-sdk-build-version']))
// Include the actual build inputs even for unreleased tarballs sharing a version.
async function hashFile(path) {
  digest
    .update(path)
    .update('\0')
    .update(
      createHash('sha256')
        .update(await readFile(join(root, path)))
        .digest(),
    )
}
async function hashDirectory(path) {
  const entries = await readdir(join(root, path), {withFileTypes: true})
  for (const entry of entries.toSorted((a, b) => a.name.localeCompare(b.name, 'en'))) {
    const child = join(path, entry.name)
    if (entry.isDirectory()) await hashDirectory(child)
    else await hashFile(child)
  }
}
for (const file of [
  'dist/setup.js',
  'template/index.js',
  'template/npm-lock.json',
  'template/package.json',
])
  await hashFile(file)
await hashDirectory('template/ios')

const app = join(
  homedir(),
  'Library/Caches/vitest-pool-react-native',
  version,
  'ios/ios/build/DerivedData/Build/Products/Debug-iphonesimulator/PoolConsumer.app',
)
const key = `vitest-pool-react-native-ios-app-v1-${process.arch}-${version}-${digest.digest('hex')}`
await appendFile(process.env.GITHUB_OUTPUT, `key=${key}\napp=${app}\nudid=${udid}\n`)
