#!/usr/bin/env node
// @env node
import {setup} from './setup.js'

const [command, platform, ...rest] = process.argv.slice(2)
const usage = 'Usage: vitest-pool-react-native setup <ios|android> [--from-source]'
const fromSource = rest.length === 1 && rest[0] === '--from-source'
if (command === '--help' || command === '-h') {
  console.log(usage)
} else if (
  command !== 'setup' ||
  (platform !== 'ios' && platform !== 'android') ||
  (rest.length && !fromSource)
) {
  console.error(usage)
  process.exitCode = 1
} else {
  try {
    await setup(platform, {fromSource})
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
