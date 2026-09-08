import type { APIRoute } from 'astro'
import { renderCard } from 'astro-cards/runtime'
import photo from '../assets/photo.png'

export const GET: APIRoute = async () =>
  new Response(JSON.stringify(await renderCard('smoke', { image: photo })))
