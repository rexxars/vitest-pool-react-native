// @env node
// The bridge stops serving the bundle before reporting a retryable timeout.
export class DeviceStartupTimeout extends Error {
  override name = 'DeviceStartupTimeout'
}

/** How long a recovering run waits for the app to contact the packager, in milliseconds. */
export const recoveryStartupTimeout = 60_000

/** Startup attempts per test file when recovery is enabled: the first run and two restarts. */
export const startupAttempts = 3

export async function withStartupRecovery(
  run: () => Promise<void>,
  restart: ((error: DeviceStartupTimeout, attempt: number) => Promise<void>) | undefined,
  signal: AbortSignal,
  attempts = startupAttempts,
): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run()
    } catch (error) {
      if (!restart || !(error instanceof DeviceStartupTimeout) || attempt >= attempts) throw error
      signal.throwIfAborted()
      await restart(error, attempt)
      signal.throwIfAborted()
    }
  }
}
