import type {NativePoolOptions} from './types/options.js'
import type {FileSpecification} from 'vitest/internal/browser'
import type {PoolOptions, PoolWorker, createMethodsRPC} from 'vitest/node'
import type {SerializedConfig} from 'vitest'
import type * as adapter from './adapter.js'

export type Platform = 'ios' | 'android'
export interface Simulator {
  name: string
  udid: string
  state: string
  lastUsedAt?: string
}

export type Cleanup = () => Promise<void>
export interface DeviceDriver<Device> {
  resolveDevice(requested?: string): Promise<Device>
  lockDevice(device: Device): Promise<Cleanup>
  prepareDevice(device: Device, appId: string, port?: number): Promise<number | void>
  launch(
    device: Device,
    appId: string,
    port: number,
    fail: (error: Error) => void,
  ): Cleanup | Promise<Cleanup>
}

export interface PoolConfig extends NativePoolOptions {
  appId: string
  device?: string
  metroPort?: number
}

export interface PoolSettings extends PoolConfig {
  appName: string
  idleTimeout: number
}

export type Method = PoolOptions['method']
export type WorkerMessage = Parameters<PoolWorker['send']>[0]
export type RunContext = Extract<WorkerMessage, {type: 'run'}>['context']
export type Spec = FileSpecification
export interface BundleOptions {
  dir: string
  root: string
  options: PoolSettings
  spec: Spec
  config: SerializedConfig
  worker: {workerId: number; concurrencyId: number}
  endpoint: string
  method: Method
  platform: Platform
}
export interface EntryOptions {
  appName: string
  platform: Platform
  method: Method
  endpoint: string
  modules: string[]
}
export interface DeviceRun {
  pool: string
  specs: Spec[]
  config: SerializedConfig
  load: Record<string, () => unknown>
  endpoint: string
  method: Method
  adapter: typeof adapter
}

export type RunnerRPC = ReturnType<typeof createMethodsRPC>
export type ResultEvent =
  | ['queued', ...Parameters<RunnerRPC['onQueued']>]
  | ['collected', ...Parameters<RunnerRPC['onCollected']>]
  | ['update', ...Parameters<RunnerRPC['onTaskUpdate']>]
  | ['done']
