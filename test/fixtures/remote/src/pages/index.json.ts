import type { APIRoute } from 'astro'
import { renderCard } from 'astro-cards/runtime'

// The origin is only known once the test's image server has a port.
export const GET: APIRoute = async () =>
  new Response(
    JSON.stringify(await renderCard('remote', { src: String(process.env.REMOTE_IMAGE) })),
  )
