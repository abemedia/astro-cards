import { execFileSync } from 'node:child_process'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { TEMP } from './utils.js'

export default function setup() {
  execFileSync('pnpm', ['build'], { cwd: join(import.meta.dirname, '..') })
  return () => rm(TEMP, { recursive: true, force: true })
}
