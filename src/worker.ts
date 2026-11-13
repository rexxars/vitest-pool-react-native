// @env node
import {EventEmitter} from 'node:events'
import {mkdtemp, rm} from 'node:fs/promises'
import {join} from 'node:path'
import type {SerializedConfig} from 'vitest'
import {createMethodsRPC, type PoolOptions, type PoolWorker} from 'vitest/node'
import {openBridge} from './bridge.js'
import {bundle} from './bundle.js'
import type {
  DeviceDriver,
  Method,
  Platform,
  PoolSettings,
  RunContext,
  Spec,
  WorkerMessage,
} from './types.js'

export class NativeWorker<Device> extends EventEmitter implements PoolWorker {
  readonly name: string
  private readonly platform: Platform
  private readonly driver: DeviceDriver<Device>
  private readonly options: PoolSettings
  private readonly rpc: ReturnType<typeof createMethodsRPC>
  private concurrencyId = 0
  private config?: SerializedConfig
  private running?: Promise<void>
  private readonly controller = new AbortController()

  constructor(
    {project, method}: PoolOptions,
    platform: Platform,
    driver: DeviceDriver<Device>,
    options: PoolSettings,
  ) {
    super()
    this.platform = platform
    this.name = 'react-native-' + platform
    this.driver = driver
    this.options = options
    this.rpc = createMethodsRPC(project, {collect: method === 'collect'})
  }
  start(): Promise<void> {
    return Promise.resolve()
  }
  deserialize(message: unknown): unknown {
    return message
  }

  private respond(type: 'started' | 'stopped' | 'testfileFinished', error?: unknown): void {
    this.emit('message', {__vitest_worker_response__: true, type, error})
  }
  send(message: WorkerMessage): void {
    if (('m' in message && message.m === 'onCancel') || message.type === 'cancel') {
      this.controller.abort(new Error(this.name + ' test run cancelled'))
    } else if (message.type === 'start') {
      this.concurrencyId = message.poolId
      this.config = message.context.config
      this.respond('started')
    } else if (message.type === 'stop') {
      this.respond('stopped')
    } else if (message.type === 'run' || message.type === 'collect') {
      this.running = this.execute(message.context, message.type).then(
        () => this.respond('testfileFinished'),
        (error) => this.respond('testfileFinished', error),
      )
    }
  }
  async stop(): Promise<void> {
    this.controller.abort(new Error(this.name + ' test worker stopped'))
    await this.running
  }
  private async execute({files, workerId}: RunContext, method: Method): Promise<void> {
    const config = this.config
    if (!config) throw new Error('Vitest sent a run request before worker startup')
    const {root} = config
    const {signal} = this.controller
    const device = await this.driver.resolveDevice(this.options.device)
    const unlock = await this.driver.lockDevice(device)
    try {
      signal.throwIfAborted()
      const metroPort = await this.driver.prepareDevice(
        device,
        this.options.appId,
        this.options.metroPort,
      )
      // Each file starts with fresh globals and a new Metro module cache.
      for (const spec of files) {
        signal.throwIfAborted()
        const dir = await mkdtemp(join(root, '.vitest-' + this.platform + '-'))
        try {
          await this.runFile(dir, device, spec, method, metroPort ?? 0, workerId, config)
        } finally {
          await rm(dir, {recursive: true, force: true})
        }
      }
    } finally {
      await unlock()
    }
  }
  private async runFile(
    dir: string,
    device: Device,
    spec: Spec,
    method: Method,
    metroPort: number,
    workerId: number,
    config: SerializedConfig,
  ): Promise<void> {
    const {signal} = this.controller
    const bridge = await openBridge(this.rpc, signal, metroPort)
    let terminate
    try {
      const result = await bundle({
        dir,
        root: config.root,
        config,
        spec,
        options: this.options,
        endpoint: bridge.endpoint,
        method,
        platform: this.platform,
        worker: {workerId, concurrencyId: this.concurrencyId},
      })
      bridge.serve(result, this.options.idleTimeout)
      terminate = await this.driver.launch(device, this.options.appId, bridge.port, bridge.fail)
      await bridge.result
    } finally {
      try {
        await terminate?.()
      } finally {
        await bridge.close()
      }
    }
  }
}
