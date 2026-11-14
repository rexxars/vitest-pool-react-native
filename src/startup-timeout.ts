// @env node
// The bridge stops serving the bundle before reporting a retryable timeout.
export class DeviceStartupTimeout extends Error {
  override name = 'DeviceStartupTimeout'
}

export async function withStartupRecovery(
  run: () => Promise<void>,
  restart: ((error: DeviceStartupTimeout) => Promise<void>) | undefined,
  signal: AbortSignal,
): Promise<void> {
  try {
    await run()
  } catch (error) {
    if (!restart || !(error instanceof DeviceStartupTimeout)) throw error
    signal.throwIfAborted()
    await restart(error)
    signal.throwIfAborted()
    await run()
  }
}
