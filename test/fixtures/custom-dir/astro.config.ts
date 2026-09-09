import { defineConfig } from 'astro/config'
import cards from 'astro-cards'

export default defineConfig({
  integrations: [cards({ dir: 'src/og' })],
})
