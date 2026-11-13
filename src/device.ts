// @env react-native
// Copied into the consumer project alongside the generated entry and adapter.
import type {VitestRunner} from 'vitest/runtime'
import type {DeviceRun, ResultEvent} from './types.js'
export async function execute({
  pool,
  specs,
  config,
  load,
  endpoint,
  method,
  adapter,
}: DeviceRun): Promise<void> {
  const {collectTests, startTests, stringify, beginAssertions, checkAssertions, extendTaskContext} =
    adapter
  let pending = Promise.resolve()
  function report(...event: ResultEvent): Promise<void> {
    // Vitest reuses its events array after this callback. Snapshot it now and
    // deliver snapshots in order, even when a hook does not await its callback.
    const body = stringify(event)
    pending = pending.then(async () => {
      const response = await fetch(endpoint, {method: 'POST', body})
      if (!response.ok)
        throw new Error('React Native result bridge returned HTTP ' + response.status)
    })
    // The final await observes failures from fire-and-forget hooks as well.
    pending.catch(() => {})
    return pending
  }

  const run = method === 'collect' ? collectTests : startTests
  if (typeof config.diff === 'object') Object.assign(config, {_diffOptions: config.diff})
  const runner: VitestRunner = {
    config,
    pool,
    importFile(path) {
      const loader = load[path]
      if (!loader) throw new Error('No Metro entry for ' + path)
      return loader()
    },
    extendTaskContext,
    onBeforeTryTask: beginAssertions,
    onAfterTryTask: (task) => checkAssertions(task, config.expect?.requireAssertions),
    onCollectStart: (file) => report('queued', file),
    onCollected: (files) => report('collected', files),
    onTaskUpdate: (packs, events) => report('update', packs, events),
  }
  await run(specs, runner)
  await report('done')
}
