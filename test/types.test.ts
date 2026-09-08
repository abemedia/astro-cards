import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { expect, test } from 'vitest'

const root = join(import.meta.dirname, 'fixtures', 'types')

test('cards are typed by name and by their own props', () => {
  const checked = spawnSync('pnpm', ['exec', 'astro', 'check'], { encoding: 'utf-8', cwd: root })

  expect(checked.stdout + checked.stderr).toContain('- 0 errors')
})
