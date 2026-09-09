import type { CardResult } from 'astro-cards'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { type Fixture, loadFixture } from './utils.js'

describe('astro 5', () => {
  let fixture: Fixture
  let server: Awaited<ReturnType<Fixture['preview']>>
  let result: CardResult
  let card: CardResult

  beforeAll(async () => {
    fixture = await loadFixture('astro-5')
    await fixture.build()
    server = await fixture.preview()
    result = await fixture.readJson('client/index.json')
    card = await (await fixture.fetch('/dynamic.json')).json()
  })

  afterAll(() => server?.stop())

  test('emits the card at build time', async () => {
    expect(result.src).toMatch(/^\/_astro\/smoke\.[0-9a-f]{20}\.png$/)
    expect(await fixture.readFile(`client${result.src}`)).toMatchImageSnapshot({
      customSnapshotIdentifier: 'card-smoke',
    })
  })

  test('renders the same card on demand', async () => {
    expect(card.src).toMatch(/^\/_cards\?p=/)
    const res = await fixture.fetch(card.src)

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    const served = Buffer.from(await res.arrayBuffer())
    expect(served.equals(await fixture.readFile(`client${result.src}`))).toBe(true)
  })
})
