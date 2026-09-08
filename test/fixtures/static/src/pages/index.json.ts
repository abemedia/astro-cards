import type { APIRoute } from 'astro'
import { renderCard } from 'astro-cards/runtime'
import photo from '../assets/photo.png'

export const GET: APIRoute = async () => {
  const cards = {
    plain: await renderCard('plain', {}),
    coarse: await renderCard('coarse', {}),
    text: await renderCard('text', { title: 'Hello' }),
    fontsource: await renderCard('text-fontsource', { title: 'Hello' }),
    manual: await renderCard('text-public', { title: 'Hello' }),
    tinted: await renderCard('text', { title: 'Hello', tone: '#3355ff' }),
    image: await renderCard('photo', { image: photo }),
    sources: await renderCard('sources', {}),
    styled: await renderCard('styled', {}),
    png: await renderCard('png', {}),
    cropped: await renderCard('text', { title: 'Hello' }, { width: 200, height: 100 }),
    webp: await renderCard('plain', {}, { format: 'webp' }),
    jpeg: await renderCard('plain', { title: 'jpeg' }, { format: 'jpeg' }),
    lowQuality: await renderCard('plain', { title: 'jpeg' }, { format: 'jpeg', quality: 10 }),
  }

  return new Response(JSON.stringify(cards))
}
