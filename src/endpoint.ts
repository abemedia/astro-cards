import { cards, config } from 'virtual:astro-cards'
import type { APIRoute } from 'astro'
import { loadCard } from './card.js'
import { decodePayload } from './payload.js'
import { rasterise } from './render.js'

export const prerender = false

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url)
  const origin = config.site ? new URL(config.site).origin : url.origin
  const payload = await decodePayload(url.searchParams.get('p') ?? '').catch(() => undefined)
  if (!payload) return new Response('Bad Request', { status: 400 })

  const { name, props, ...overrides } = payload
  if (!Object.hasOwn(cards, name)) return new Response('Not Found', { status: 404 })
  const { options, type, render } = await loadCard(name, overrides)
  const bytes = await rasterise(
    { name, markup: await render(props), ...options },
    {
      origin,
      base: config.base,
      imageConfig: config.image,
      assetsPrefix:
        typeof config.assetsPrefix === 'string'
          ? [config.assetsPrefix]
          : Object.values(config.assetsPrefix ?? {}),
    },
  )

  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
  const etag = Array.from(new Uint8Array(digest, 0, 10), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')

  return new Response(bytes as BodyInit, {
    headers: {
      'Content-Type': type,
      'Cache-Control': 'public, max-age=31536000',
      ETag: `"${etag}"`,
    },
  })
}
