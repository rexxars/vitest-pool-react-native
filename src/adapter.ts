// @env react-native
// Only this bundle sees Vitest's worker and matcher state. Rolldown rewrites
// globalThis here and in Vitest's dependencies to the adapter's private object.
import type {RunnerTestCase, TestContext} from 'vitest'
import {createExpect, expect} from 'vitest'

export {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  onTestFailed,
  onTestFinished,
  suite,
  test,
} from 'vitest'
export {collectTests, startTests} from 'vitest/internal/browser'
export {stringify} from 'flatted'

export function extendTaskContext(context: TestContext): TestContext {
  return Object.assign(context, {expect: createExpect(context.task)})
}

export function beginAssertions(task: RunnerTestCase): void {
  const state = {
    assertionCalls: 0,
    expectedAssertionsNumber: null,
    isExpectingAssertions: false,
    currentTestName: task.fullTestName,
  }
  expect.setState(state)
  task.context.expect.setState(state)
}

export function checkAssertions(task: RunnerTestCase, requireAssertions?: boolean): void {
  const local = task.context.expect.getState()
  const global = expect.getState()
  for (const state of [local, global]) {
    if (
      state.expectedAssertionsNumber != null &&
      state.assertionCalls !== state.expectedAssertionsNumber
    ) {
      throw (
        state.expectedAssertionsNumberErrorGen?.() ??
        new Error('Expected ' + state.expectedAssertionsNumber + ' assertions')
      )
    }
    if (state.isExpectingAssertions && !state.assertionCalls)
      throw state.isExpectingAssertionsError ?? new Error('Expected at least one assertion')
  }
  if (requireAssertions && !local.assertionCalls && !global.assertionCalls)
    throw new Error('Expected at least one assertion')
}
