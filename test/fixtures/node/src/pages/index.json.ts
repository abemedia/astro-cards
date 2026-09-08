import type { APIRoute } from 'astro'
import { renderCard } from 'astro-cards/runtime'
import photo from '../assets/photo.png'

export const GET: APIRoute = async () => {
  const cards = {
    smoke: await renderCard('smoke', { image: photo }),
    image: await renderCard('photo', { image: photo }),
    cropped: await renderCard('smoke', { image: photo }, { width: 200, height: 100 }),
    nested: await renderCard('nested/badge', {}),
    awkward: await renderCard('50%#top', {}),
  }

  return new Response(JSON.stringify(cards))
}
