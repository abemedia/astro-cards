import type { CardResult } from 'astro-cards'
import { expect, test } from 'vitest'
import { loadFixture } from './utils.js'

// The fixture keeps its cards in `src/og`, so a default `src/cards` scan finds nothing at all.
test('discovers cards from the configured directory', async () => {
  const fixture = await loadFixture('custom-dir')
  await fixture.build()
  const card: CardResult = await fixture.readJson('index.json')

  expect(card.src).toMatch(/^\/_astro\/badge\.[0-9a-f]{20}\.jpg$/)
  expect(await fixture.readdir('_astro')).toContain(card.src.replace('/_astro/', ''))
})
