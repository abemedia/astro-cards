import { afterEach, describe, expect, test, vi } from 'vitest'
import { type RenderEnv, rasterise } from '../../src/render'

const ORIGIN = 'https://site.test'

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
)

const card = (src: string) => ({
  name: 'unit',
  markup: `<div style="width: 10px; height: 10px"><img src="${src}" width="10" height="10" /></div>`,
  width: 10,
  height: 10,
  format: 'png' as const,
  quality: 90,
})

const env = (overrides: Partial<RenderEnv> = {}): RenderEnv => ({
  origin: ORIGIN,
  base: '/',
  imageConfig: { domains: [], remotePatterns: [] },
  ...overrides,
})

/** Only what the fixtures cannot produce: same-origin reads and plain fetches run there. */
describe('rasterise', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  test('does not treat a lookalike host as our own', async () => {
    const readLocal = vi.fn()
    const fetchSpy = vi.fn().mockResolvedValue(new Response(PNG))
    vi.stubGlobal('fetch', fetchSpy)

    await rasterise(
      card('https://site.test.evil.com/a.png'),
      env({ readLocal, imageConfig: { domains: ['site.test.evil.com'], remotePatterns: [] } }),
    )

    expect(readLocal).not.toHaveBeenCalled()
    expect(fetchSpy).toHaveBeenCalledWith('https://site.test.evil.com/a.png', expect.anything())
  })

  test.each([
    ['https://cdn.test/', 'a trailing slash'],
    ['https://cdn.test', 'no trailing slash'],
    ['https://cdn.test/static', 'a path segment'],
  ])('reads assets behind the CDN prefix %s locally (%s)', async (assetsPrefix) => {
    const readLocal = vi.fn().mockResolvedValue(PNG)
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    await rasterise(
      card(`${assetsPrefix.replace(/\/$/, '')}/_astro/a%20b.png?v=1`),
      env({ readLocal, assetsPrefix: [assetsPrefix] }),
    )

    expect(readLocal).toHaveBeenCalledWith('/_astro/a b.png')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  test('admits the configured CDN without listing it as a remote domain', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(PNG))
    vi.stubGlobal('fetch', fetchSpy)

    await rasterise(
      card('https://cdn.test/_astro/a.png'),
      env({ assetsPrefix: ['https://cdn.test/'] }),
    )

    expect(fetchSpy).toHaveBeenCalledWith('https://cdn.test/_astro/a.png', expect.anything())
  })

  // Astro's object form spreads assets across hosts by extension, so every prefix has to resolve.
  test('reads locally from whichever configured prefix an asset sits behind', async () => {
    const readLocal = vi.fn().mockResolvedValue(PNG)
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    await rasterise(
      card('https://images.cdn.test/_astro/a.png'),
      env({ readLocal, assetsPrefix: ['https://js.cdn.test/', 'https://images.cdn.test/'] }),
    )

    expect(readLocal).toHaveBeenCalledWith('/_astro/a.png')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  test('does not treat a lookalike path as the configured prefix', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(PNG))
    vi.stubGlobal('fetch', fetchSpy)
    const prefixed = env({ assetsPrefix: ['https://s3.test/my-bucket'] })

    await rasterise(card('https://s3.test/my-bucket/a.png'), prefixed)
    expect(fetchSpy).toHaveBeenCalledWith('https://s3.test/my-bucket/a.png', expect.anything())

    await expect(rasterise(card('https://s3.test/my-bucket-evil/a.png'), prefixed)).rejects.toThrow(
      /blocked by allowUrl/,
    )
  })

  test('forwards init so takumi keeps control of redirects', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(PNG))
    vi.stubGlobal('fetch', fetchSpy)

    await rasterise(
      card('https://other.test/a.png'),
      env({ imageConfig: { domains: ['other.test'], remotePatterns: [] } }),
    )

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://other.test/a.png',
      expect.objectContaining({ redirect: 'manual' }),
    )
  })

  test('fetches a font from any host, outside the image policy', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(null, { status: 404 }))
    vi.stubGlobal('fetch', fetchSpy)
    const markup = `
      <style>@font-face { font-family: R; src: url(https://fonts.test/r.woff2) }</style>
      <div style="font-family: R">x</div>
    `

    await expect(rasterise({ ...card('/a.png'), markup }, env())).rejects.toThrow(
      /HTTP 404\s+fetching https:\/\/fonts\.test\/r\.woff2/,
    )
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://fonts.test/r.woff2',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  test('fails when text has no font and the default cannot be loaded', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(null, { status: 503 }))
    vi.stubGlobal('fetch', fetchSpy)
    const markup = '<div style="width: 10px; height: 10px">Hello</div>'

    await expect(rasterise({ ...card('/a.png'), markup }, env())).rejects.toThrow(
      /error fetching Noto Sans from Google Fonts: HTTP 503/,
    )

    const requested = fetchSpy.mock.calls.map(([url]) => String(url))
    expect(requested.some((url) => url.includes('fonts.googleapis.com'))).toBe(true)
    expect(requested.some((url) => url.includes('Noto+Sans'))).toBe(true)
  })

  test('reaches for no fallback when the card draws no text', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const readLocal = vi.fn().mockResolvedValue(PNG)

    await rasterise(card('/a.png'), env({ readLocal }))

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  test('uses the fetch the caller supplies, so a build can record what came back', async () => {
    const global = vi.fn()
    vi.stubGlobal('fetch', global)
    const injected = vi.fn().mockResolvedValue(new Response(PNG))

    await rasterise(
      card('https://other.test/a.png'),
      env({ fetch: injected, imageConfig: { domains: ['other.test'], remotePatterns: [] } }),
    )

    expect(injected).toHaveBeenCalledWith('https://other.test/a.png', expect.anything())
    expect(global).not.toHaveBeenCalled()
  })

  test('propagates a read failure, naming the card', async () => {
    const readLocal = vi.fn().mockRejectedValue(new Error('ENOENT'))

    await expect(rasterise(card('/_astro/missing.png'), env({ readLocal }))).rejects.toThrow(
      /card "unit" failed: .*ENOENT/,
    )
  })
})
