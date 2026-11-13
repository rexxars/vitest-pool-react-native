// @env node
import type {EntryOptions} from './types.js'

export function entry({appName, platform, method, endpoint, modules}: EntryOptions): string {
  const loaders = modules.map(
    (file) => `${JSON.stringify(file)}: () => require(${JSON.stringify(file)})`,
  )
  return `
const {AppRegistry} = require('react-native')
AppRegistry.registerComponent(${JSON.stringify(appName)}, () => () => null)
const endpoint = ${JSON.stringify(endpoint)}
async function main() {
  if (!globalThis.HermesInternal) throw new Error('The React Native test app must run Hermes')
  const {execute} = require('./device')
  const adapter = require('./adapter')
  const {config, ctx} = require('./context')
  await execute({pool: ${JSON.stringify('react-native-' + platform)}, method: ${JSON.stringify(method)}, config, specs: ctx.files, endpoint, adapter, load: {${loaders.join(',\n')}}})
}
setTimeout(() => main().catch(error => fetch(endpoint + '/error', {
  method: 'POST', body: JSON.stringify({message: String(error), stack: error?.stack}),
})), 0)
`
}
