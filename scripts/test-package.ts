// @env node
import {execFileSync} from 'node:child_process'
import {cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const [platform, version, flag, destination] = process.argv.slice(2)
if (platform !== 'ios' && platform !== 'android') throw new Error('Choose ios or android')
if (flag !== undefined && (flag !== '--prepare-in' || !destination))
  throw new Error('Expected --prepare-in <new directory>')

const npm = process.env.npm_execpath
if (!npm) throw new Error('Run this script with npm run test:package')
function run(cwd: string, ...args: string[]): void {
  execFileSync(process.execPath, args, {cwd, stdio: 'inherit'})
}

// CI hands the installed consumer over to the Android action in the next step.
const work = destination ?? (await mkdtemp(join(tmpdir(), 'vitest-native-package-')))
if (destination) await mkdir(destination)
try {
  run(root, npm, 'pack', '--pack-destination', work)
  const archive = (await readdir(work)).find((file) => file.endsWith('.tgz'))
  if (!archive) throw new Error('npm pack did not create a tarball')
  const {devDependencies} = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  const dependencies = {
    'vitest-pool-react-native': 'file:./' + archive,
    'runtime-probe': 'file:./fixtures/runtime-probe',
    vitest: version ?? devDependencies.vitest,
    react: devDependencies.react,
    'react-native': devDependencies['react-native'],
    metro: devDependencies.metro,
    '@react-native/metro-config': devDependencies['@react-native/metro-config'],
  }
  await writeFile(
    join(work, 'package.json'),
    JSON.stringify({
      name: 'test-library',
      private: true,
      type: 'module',
      devDependencies: dependencies,
    }),
  )
  for (const path of ['fixtures/runtime-probe', 'tests', 'vitest.config.ts']) {
    await cp(join(root, path), join(work, path), {recursive: true})
  }
  run(work, npm, 'install', '--no-audit', '--no-fund')
  if (!destination) {
    run(work, npm, 'exec', '--', 'vitest-pool-react-native', 'setup', platform)
    run(work, npm, 'exec', '--', 'vitest', 'run', '--project', platform)
  }
} finally {
  if (!destination) await rm(work, {recursive: true, force: true})
}
