// @env node
import {clearTimeout, setTimeout} from 'node:timers'
import type {RunnerTask} from 'vitest'
import type {RunBuildResult} from 'metro'
import type {RunnerRPC, ResultEvent} from './types.js'
import {createServer} from 'node:http'
import {randomUUID} from 'node:crypto'
import {once} from 'node:events'
import {text} from 'node:stream/consumers'
import {parse} from 'flatted'
import {TraceMap, originalPositionFor} from '@jridgewell/trace-mapping'

// Hermes reports stack positions in the downloaded bundle, with 1-based columns.
function mapError(error: {stack?: string}, map: TraceMap) {
  if (typeof error?.stack !== 'string') return
  error.stack = error.stack.replace(
    /(?:https?:\/\/[^\s()]+\/)?index\.bundle(?:\?[^\s()]+?)?:(\d+):(\d+)/g,
    (frame, line, column) => {
      const source = originalPositionFor(map, {
        line: Number(line),
        column: Math.max(0, Number(column) - 1),
      })
      return source.source && source.column !== null
        ? `${source.source}:${source.line}:${source.column + 1}`
        : frame
    },
  )
}

function mapResultErrors(result: RunnerTask['result'], map: TraceMap) {
  // Vitest 5 retains the failures of individual retries, including those of
  // a test that eventually passes. An error can occur in both lists.
  const errors = new Set(result?.errors)
  for (const attempt of result?.attempts ?? []) {
    for (const error of attempt.errors ?? []) errors.add(error)
  }
  for (const error of errors) mapError(error, map)
}

function mapTaskErrors(task: RunnerTask, map: TraceMap) {
  mapResultErrors(task.result, map)
  for (const child of 'tasks' in task ? task.tasks : []) mapTaskErrors(child, map)
}

export async function openBridge(rpc: RunnerRPC, signal: AbortSignal, listenPort = 0) {
  const resultPath = '/results/' + randomUUID()
  const server = createServer()
  const completion = Promise.withResolvers<void>()
  // Startup, bundling or the simulator can fail before wait() is reached.
  completion.promise.catch(() => {})
  let bundle: string | undefined
  let map: TraceMap | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let timeout: number
  let completed = false

  function fail(error: unknown): void {
    if (completed) return
    completed = true
    clearTimeout(timer)
    completion.reject(error)
  }
  function resetDeadline() {
    clearTimeout(timer)
    timer = setTimeout(
      () =>
        fail(
          new Error(
            `No response from the React Native app for ${timeout} ms. Check the app's development server address, registered component and device log.`,
          ),
        ),
      timeout,
    )
  }
  const abort = () => fail(signal.reason)
  signal.addEventListener('abort', abort, {once: true})
  server.on('request', async (request, response) => {
    try {
      const path = request.url?.split('?')[0]
      if (request.method === 'GET' && path === '/status')
        return response.end('packager-status:running')
      if (request.method === 'GET' && path === '/index.bundle' && bundle) {
        response.setHeader('Content-Type', 'application/javascript')
        return response.end(bundle)
      }
      if (
        request.method !== 'POST' ||
        !map ||
        completed ||
        (path !== resultPath && path !== resultPath + '/error')
      ) {
        response.writeHead(404).end()
        return
      }
      resetDeadline()
      const payload = await text(request)
      if (path.endsWith('/error')) {
        const {message, stack} = JSON.parse(payload)
        const error = Object.assign(new Error(message), {stack})
        mapError(error, map)
        throw error
      }
      const event: ResultEvent = parse(payload)
      switch (event[0]) {
        case 'queued':
          rpc.onQueued(event[1])
          break
        case 'collected':
          for (const file of event[1]) mapTaskErrors(file, map)
          await rpc.onCollected(event[1])
          break
        case 'update':
          for (const [, result] of event[1]) mapResultErrors(result, map)
          await rpc.onTaskUpdate(event[1], event[2])
          break
        case 'done':
          completed = true
          clearTimeout(timer)
          completion.resolve()
          break
        default:
          throw new Error('Unknown React Native test event')
      }
      response.writeHead(204).end()
    } catch (error) {
      response.writeHead(500).end()
      fail(error)
    }
  })
  try {
    server.listen(listenPort, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('No TCP address for the result bridge')
    const {port} = address
    return {
      port,
      endpoint: `http://127.0.0.1:${port}${resultPath}`,
      result: completion.promise,
      fail,
      serve(result: RunBuildResult, idleTimeout: number) {
        signal.throwIfAborted()
        bundle = result.code
        map = new TraceMap(result.map)
        timeout = idleTimeout
        resetDeadline()
      },
      async close() {
        clearTimeout(timer)
        signal.removeEventListener('abort', abort)
        const closed = new Promise((resolve) => server.close(resolve))
        server.closeAllConnections()
        await closed
      },
    }
  } catch (error) {
    signal.removeEventListener('abort', abort)
    server.close()
    if (listenPort && error instanceof Error && 'code' in error && error.code === 'EADDRINUSE') {
      throw new Error(
        `Port ${listenPort} is already in use. Stop the other Metro server or select a development app configured for a different port.`,
        {cause: error},
      )
    }
    throw error
  }
}
