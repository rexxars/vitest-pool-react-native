// @env node
import {join} from 'node:path'
import {rolldown} from 'rolldown'

export async function buildAdapter(input: string, dir: string): Promise<void> {
  const build = await rolldown({
    input,
    platform: 'browser',
    transform: {define: {globalThis: 'runnerGlobals'}},
    onwarn(warning) {
      throw new Error(warning.message)
    },
  })
  try {
    await build.write({
      file: join(dir, 'adapter.js'),
      format: 'cjs',
      codeSplitting: false,
      banner: `var runnerGlobals = Object.create(globalThis);
runnerGlobals.__vitest_worker__ = require('./context');
var Event = globalThis.Event || require('react-native/src/private/webapis/dom/events/Event').default;
var EventTarget = globalThis.EventTarget || require('react-native/src/private/webapis/dom/events/EventTarget').default;
// Vitest initializes its mock registry when importing expect. Its lifetime
// here is one test file, and the adapter does not export the mocking API.
var FinalizationRegistry = globalThis.FinalizationRegistry || class { register() {} };`,
    })
  } finally {
    await build.close()
  }
}
