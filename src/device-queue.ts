// @env node
const pending = new Map<string, Promise<void>>()

// Vitest can schedule several files (or projects) against the same device.
// Keep the native lock for other processes, and queue workers from this process.
export async function runOnDevice(key: string, run: () => Promise<void>): Promise<void> {
  const previous = pending.get(key) ?? Promise.resolve()
  const current = previous.then(run)
  const settled = current.catch(() => {})
  pending.set(key, settled)
  try {
    await current
  } finally {
    if (pending.get(key) === settled) pending.delete(key)
  }
}
