import type { APIRoute } from 'astro'
import { renderCard } from 'astro-cards/runtime'

export const GET: APIRoute = async () => new Response(JSON.stringify(await renderCard('bad', {})))
