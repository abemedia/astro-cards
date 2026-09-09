import type { CardResult } from 'astro-cards'
import { beforeAll, describe, expect, test } from 'vitest'
import { type Fixture, loadFixture } from './utils.js'

type Cards = Record<string, CardResult>

describe('static build', () => {
  let fixture: Fixture
  let cards: Cards
  const bytes: Record<string, Buffer> = {}

  beforeAll(async () => {
    fixture = await loadFixture('static')
    await fixture.build()
    cards = await fixture.readJson('index.json')
    // Read now: the nested build below replaces the output directory.
    for (const id of ['sources', 'image']) bytes[id] = await fixture.readFile(cards[id].src)
  })

  test('emits every card it reported into the assets directory', async () => {
    const files = await fixture.readdir('_astro')

    expect(Object.keys(cards).length).toBeGreaterThan(0)
    for (const [id, card] of Object.entries(cards)) {
      expect(files, `card "${id}"`).toContain(card.src.replace('/_astro/', ''))
    }
  })

  test('references cards by name and content hash', () => {
    expect(cards.text.src).toMatch(/^\/_astro\/text\.[0-9a-f]{20}\.jpg$/)
  })

  test('extends the URL with the resolved format', () => {
    expect(cards.text.src).toMatch(/\.jpg$/)
    expect(cards.png.src).toMatch(/\.png$/)
    expect(cards.webp.src).toMatch(/\.webp$/)
  })

  test('reports the MIME type of the resolved format', () => {
    expect(cards.text.type).toBe('image/jpeg')
    expect(cards.png.type).toBe('image/png')
    expect(cards.webp.type).toBe('image/webp')
  })

  test('gives cards differing only in props distinct URLs', () => {
    expect(cards.text.src).not.toBe(cards.tinted.src)
  })

  describe('under a base path', () => {
    let based: Fixture
    let basedCards: Cards

    beforeAll(async () => {
      based = await loadFixture('static', { base: '/docs' })
      await based.build()
      basedCards = await based.readJson('index.json')
    })

    test('prefixes card URLs with the base', () => {
      expect(basedCards.text.src).toMatch(/^\/docs\/_astro\/text\./)
    })

    test('renders the same bytes as the default build', async () => {
      const identical: Record<string, boolean> = {}
      for (const id of ['sources', 'image']) {
        const file = await based.readFile(basedCards[id].src.replace('/docs/', ''))
        identical[id] = file.equals(bytes[id])
      }
      expect(identical).toEqual({ sources: true, image: true })
    })
  })

  describe('behind a CDN prefix', () => {
    let cdn: Fixture
    let cdnCards: Cards

    beforeAll(async () => {
      cdn = await loadFixture('static', { build: { assetsPrefix: 'https://cdn.test' } })
      await cdn.build()
      cdnCards = await cdn.readJson('index.json')
    })

    test('serves card URLs from the prefix', () => {
      expect(cdnCards.text.src).toMatch(/^https:\/\/cdn\.test\/_astro\/text\./)
    })

    // Nothing serves the CDN during a build, so identical bytes mean it read the output instead.
    test('reads prefixed assets back out of the output directory', async () => {
      const identical: Record<string, boolean> = {}
      for (const id of ['sources', 'image']) {
        const file = await cdn.readFile(new URL(cdnCards[id].src).pathname)
        identical[id] = file.equals(bytes[id])
      }
      expect(identical).toEqual({ sources: true, image: true })
    })
  })

  describe('with no configured site', () => {
    let unset: Fixture
    let unsetCards: Cards

    beforeAll(async () => {
      unset = await loadFixture('static', { site: undefined })
      await unset.build()
      unsetCards = await unset.readJson('index.json')
    })

    test('still resolves assets back to the output directory', async () => {
      const identical: Record<string, boolean> = {}
      for (const id of ['sources', 'image']) {
        identical[id] = (await unset.readFile(unsetCards[id].src)).equals(bytes[id])
      }
      expect(identical).toEqual({ sources: true, image: true })
    })
  })
})
