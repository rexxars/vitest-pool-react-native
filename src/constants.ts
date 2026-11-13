export const appId = 'dev.vitest.pool.consumer'
export const appName = 'PoolConsumer'
export const idleTimeout = 120_000

export const runnerKeys = [
  'name',
  'root',
  'setupFiles',
  'passWithNoTests',
  'testNamePattern',
  'allowOnly',
  'sequence',
  'maxConcurrency',
  'testTimeout',
  'hookTimeout',
  'retry',
  'repeats',
  'expect',
  'includeTaskLocation',
  'tags',
  'tagsFilter',
  'strictTags',
  'diff',
  'taskTitleValueFormatTruncate',
  'mergeReportsLabel',
] as const
