// @env node
import {copyFile, writeFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {dirname, join, resolve, sep} from 'node:path'
import {fileURLToPath} from 'node:url'
import type {BundleOptions} from './types.js'
import {runnerKeys} from './constants.js'
import type {RunBuildResult} from 'metro'
import {buildAdapter} from './build-adapter.js'
import {entry} from './entry.js'

const source = dirname(fileURLToPath(import.meta.url))

function serialize(value: unknown): string {
  // Vitest's -t filter and retry conditions can be RegExp objects.
  return JSON.stringify(value, (_, item) =>
    item instanceof RegExp ? {__nativePoolRegExp: [item.source, item.flags]} : item,
  )
}

const escape = (p: string) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Stock Metro filters out __tests__ directories, even when Vitest selects
// files there. Exempt the selected test/setup paths and their ancestor dirs.
function allowTestPaths(
  blockList: RegExp | RegExp[],
  files: string[],
  helpers: string[],
): RegExp | RegExp[] {
  const blocked = blockList instanceof RegExp ? [blockList] : blockList
  if (!blocked.some((re) => re && [...files, ...helpers].some((p) => re.test(p)))) return blockList
  const paths = new Set<string>()
  for (const file of [...files, ...helpers]) {
    for (let p = file; !paths.has(p); p = dirname(p)) paths.add(p)
  }
  const exemptions = [...paths].map((p) => escape(p) + '$')
  for (const p of helpers) exemptions.push(escape(p + sep))
  return blocked
    .filter(Boolean)
    .map(
      (re) =>
        new RegExp('^(?!(?:' + exemptions.join('|') + '))(?:.*(?:' + re.source + '))', re.flags),
    )
}

export async function bundle({
  dir,
  root,
  options,
  spec,
  config,
  worker,
  endpoint,
  method,
  platform,
}: BundleOptions): Promise<RunBuildResult> {
  const req = createRequire(join(root, 'package.json'))
  const metro: typeof import('metro') = req('metro')
  const rnConfig: typeof import('@react-native/metro-config') = req('@react-native/metro-config')
  const defaults = rnConfig.getDefaultConfig(root)
  const resolved = await metro.loadConfig(
    {
      cwd: root,
      config: options.metroConfig && resolve(root, options.metroConfig),
      verbose: false,
    },
    defaults,
  )

  const modules = [...new Set([spec.filepath, ...config.setupFiles])]
  const testFiles = new Set(modules)
  const helpers = (options.testHelpers ?? []).map((p) => resolve(root, p))
  const originalResolver = resolved.resolver.resolveRequest
  const resolver: typeof resolved.resolver = {
    ...resolved.resolver,
    blockList: allowTestPaths(resolved.resolver.blockList, modules, helpers),
    resolveRequest(ctx, name, targetPlatform) {
      const importer = ctx.originModulePath
      if (
        name === 'vitest' &&
        (testFiles.has(importer) ||
          helpers.some((p) => importer === p || importer.startsWith(p + sep)))
      ) {
        return {type: 'sourceFile', filePath: join(dir, 'adapter.js')}
      }
      return (originalResolver ?? ctx.resolveRequest)(ctx, name, targetPlatform)
    },
  }
  await buildAdapter(join(source, 'adapter.js'), dir)
  // Vitest reads worker state while its assertion plugins are initializing.
  // Only the adapter and entry point import this module.
  const runnerConfig = Object.fromEntries(runnerKeys.map((key) => [key, config[key]]))
  const state = {config: runnerConfig, filepath: spec.filepath, ctx: {...worker, files: [spec]}}
  await writeFile(
    join(dir, 'context.js'),
    `module.exports = JSON.parse(${JSON.stringify(serialize(state))}, (_, value) =>
    value && value.__nativePoolRegExp ? new RegExp(...value.__nativePoolRegExp) : value)\n`,
  )
  await copyFile(join(source, 'device.js'), join(dir, 'device.js'))
  const file = join(dir, 'entry.js')
  await writeFile(file, entry({appName: options.appName, platform, endpoint, method, modules}))
  const result = await metro.runBuild(
    {
      ...resolved,
      resolver,
      watchFolders: [...new Set([...resolved.watchFolders, root, dir])],
    },
    {entry: file, platform, dev: false, minify: false, sourceMap: true, sourceMapUrl: 'index.map'},
  )
  return result
}
