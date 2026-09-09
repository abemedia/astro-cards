import { request } from 'node:http'
import type { CardResult } from 'astro-cards'
import { stringify } from 'devalue'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { type Fixture, loadFixture } from './utils.js'

type Cards = Record<string, CardResult>

/** The wire format, so a payload the encoder would refuse can still reach the endpoint. */
const encode = async (payload: unknown) => {
  const source = new Blob([stringify(payload)]).stream()
  const deflated = await new Response(
    source.pipeThrough(new CompressionStream('deflate-raw')),
  ).bytes()
  return Buffer.from(deflated).toString('base64url')
}

describe('on-demand endpoint', () => {
  let fixture: Fixture
  let server: Awaited<ReturnType<Fixture['preview']>>
  let cards: Cards
  let results: Cards

  beforeAll(async () => {
    fixture = await loadFixture('node')
    await fixture.build()
    server = await fixture.preview()
    cards = await (await fixture.fetch('/dynamic.json')).json()
    results = await fixture.readJson('client/index.json')
  })

  afterAll(() => server?.stop())

  const served = async (path: string) =>
    Buffer.from(await (await fixture.fetch(path)).arrayBuffer())

  test('returns an endpoint URL rather than an emitted file', () => {
    expect(cards.smoke.src).toMatch(/^\/_cards\?p=[A-Za-z0-9_-]+$/)
  })

  test('renders the card the props describe', async () => {
    const res = await fixture.fetch(cards.smoke.src)

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000')
    expect(res.headers.get('etag')).toMatch(/^"[0-9a-f]{20}"$/)

    const { width, height, format } = await sharp(Buffer.from(await res.arrayBuffer())).metadata()
    expect({ width, height, format }).toEqual({ width: 400, height: 200, format: 'png' })
  })

  test('carries a call-site override, but resolves the rest server-side', async () => {
    // `smoke` exports 400x200 and never travels; `cropped` overrides it at the call site.
    const meta = async (id: string) => sharp(await served(cards[id].src)).metadata()

    expect(await meta('cropped')).toMatchObject({ width: 200, height: 100 })
    expect(await meta('smoke')).toMatchObject({ width: 400, height: 200 })
  })

  test("produces byte-identical output to the same build's emitted files", async () => {
    const identical: Record<string, boolean> = {}
    for (const id of ['smoke', 'image']) {
      identical[id] = (await served(cards[id].src)).equals(
        await fixture.readFile(`client${results[id].src}`),
      )
    }
    expect(identical).toEqual({ smoke: true, image: true })
  })

  test('flattens a card name into a safe filename', async () => {
    expect(results.nested.src).toMatch(/^\/_astro\/badge\.[0-9a-f]{20}\.png$/)
    expect(results.awkward.src).toMatch(/^\/_astro\/50__top\.[0-9a-f]{20}\.jpg$/)

    const res = await fixture.fetch(cards.nested.src)
    expect(res.status).toBe(200)
    expect(Buffer.from(await res.arrayBuffer())).toEqual(
      await fixture.readFile(`client${results.nested.src}`),
    )
  })

  test('rejects a card that does not exist', async () => {
    const p = await encode({ name: 'nope', props: {} })
    expect((await fixture.fetch(`/_cards?p=${p}`)).status).toBe(404)
  })

  test('rejects a malformed or missing payload', async () => {
    expect((await fixture.fetch('/_cards?p=not-a-payload')).status).toBe(400)
    expect((await fixture.fetch('/_cards')).status).toBe(400)
  })

  test('rejects a payload that inflates beyond the cap', async () => {
    const bomb = await encode({ name: 'smoke', props: { pad: 'x'.repeat(512 * 1024) } })

    expect(bomb.length).toBeLessThan(4096)
    expect((await fixture.fetch(`/_cards?p=${bomb}`)).status).toBe(400)
  })

  test('rejects a well-formed payload of the wrong shape', async () => {
    const status = async (payload: unknown) =>
      (await fixture.fetch(`/_cards?p=${await encode(payload)}`)).status

    expect(await status({})).toBe(400)
    expect(await status({ name: 'smoke', props: {}, format: 'raw' })).toBe(400)
    expect(await status({ name: 'smoke', props: {}, width: 0, height: 200 })).toBe(400)
    expect(await status({ name: 'smoke', props: {}, bogus: 1 })).toBe(400)
  })

  test('ignores the request host when resolving assets', async () => {
    // `fetch` overwrites `Host`, so the spoof has to go out over `node:http`.
    const spoofed = await new Promise<{ status: number; body: Buffer }>((resolve, reject) => {
      const req = request(
        {
          host: server.host,
          port: server.port,
          path: cards.image.src,
          headers: { Host: 'spoofed.test' },
        },
        (res) => {
          const chunks: Buffer[] = []
          res.on('data', (chunk) => chunks.push(chunk))
          res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks) }))
        },
      )
      req.on('error', reject)
      req.end()
    })

    expect(spoofed.status).toBe(200)
    expect(spoofed.body.equals(await served(cards.image.src))).toBe(true)
  })
})
