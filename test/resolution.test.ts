import cards, { type CardResult } from 'astro-cards'
import sharp from 'sharp'
import { beforeAll, describe, expect, test } from 'vitest'
import { type Fixture, loadFixture } from './utils.js'

type Cards = Record<string, CardResult>

/** Asserts the emitted file, then that the returned metadata agrees with it. */
const check = async (fixture: Fixture, card: CardResult, expected: object) => {
  const { width, height, format } = await sharp(await fixture.readFile(card.src)).metadata()

  expect({ width, height, format }).toEqual(expected)
  expect({ width: card.width, height: card.height }).toEqual({ width, height })
}

describe('size and format resolution', () => {
  describe('against a configured default', () => {
    let fixture: Fixture
    let results: Cards

    beforeAll(async () => {
      // All three differ from the built-in defaults, so an ignored config fails.
      fixture = await loadFixture('static', {
        integrations: [cards({ width: 600, height: 300, format: 'webp', quality: 100 })],
      })
      await fixture.build()
      results = await fixture.readJson('index.json')
    })

    test('a card declaring nothing takes both from the config', async () => {
      await check(fixture, results.plain, { width: 600, height: 300, format: 'webp' })
    })

    test('a size the card exports wins over the config', async () => {
      await check(fixture, results.text, { width: 400, height: 200, format: 'webp' })
    })

    test('a format the card exports wins over the config', async () => {
      await check(fixture, results.png, { width: 600, height: 300, format: 'png' })
    })

    test('a size from the call site wins over the card', async () => {
      await check(fixture, results.cropped, { width: 200, height: 100, format: 'webp' })
    })

    test('a format from the call site wins over the config', async () => {
      await check(fixture, results.jpeg, { width: 600, height: 300, format: 'jpeg' })
    })

    test('a quality the card exports wins over the config', async () => {
      const low = await fixture.readFile(results.coarse.src)
      const high = await fixture.readFile(results.plain.src)
      expect(low.length).toBeLessThan(high.length)
    })

    test('a quality from the call site wins over the config', async () => {
      const low = await fixture.readFile(results.lowQuality.src)
      const high = await fixture.readFile(results.jpeg.src)
      expect(low.length).toBeLessThan(high.length)
    })
  })

  describe('with no configuration at all', () => {
    let fixture: Fixture
    let results: Cards

    beforeAll(async () => {
      fixture = await loadFixture('static')
      await fixture.build()
      results = await fixture.readJson('index.json')
    })

    test('falls back to the integration defaults', async () => {
      await check(fixture, results.plain, { width: 1200, height: 630, format: 'jpeg' })
    })
  })
})
