// @env node
import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts', 'src/adapter.ts', 'src/device.ts'],
  format: 'esm',
  target: 'es2022',
  fixedExtension: false,
  // Metro copies the device entry by itself; keep its runtime imports local to Hermes.
  unbundle: true,
  deps: {neverBundle: true},
  dts: {entry: ['src/index.ts']},
})
