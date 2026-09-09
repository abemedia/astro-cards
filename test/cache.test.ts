import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { CardResult } from 'astro-cards'
import { beforeAll, describe, expect, test } from 'vitest'
import { type Fixture, loadFixture } from './utils.js'

const SENTINEL = Buffer.from('not an image')

describe('build cache', () => {
  let fixture: Fixture
  let cards: Record<string, CardResult>

  beforeAll(async () => {
    fixture = await loadFixture('static')
    await fixture.build()
    cards = await fixture.readJson('index.json')
  })

  const entry = (card: CardResult) => join(fixture.cacheDir, card.src.replace('/_astro/', ''))

  test('reuses a card whose inputs are unchanged', async () => {
    await writeFile(entry(cards.plain), SENTINEL)
    await fixture.build()

    expect(await fixture.readFile(cards.plain.src)).toEqual(SENTINEL)
  })

  test('re-renders when a file the card read has changed', async () => {
    await writeFile(entry(cards.sources), SENTINEL)
    const sidecar = `${entry(cards.sources)}.json`
    const deps = JSON.parse(await readFile(sidecar, 'utf-8'))
    expect(Object.keys(deps)).toEqual(['/photo.png'])
    await writeFile(sidecar, JSON.stringify({ '/photo.png': { sha: 'changed' } }))

    await fixture.build()

    expect(await fixture.readFile(cards.sources.src)).not.toEqual(SENTINEL)
  })
})
