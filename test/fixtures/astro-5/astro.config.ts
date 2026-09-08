import node from '@astrojs/node'
import { defineConfig } from 'astro/config'
import cards from 'astro-cards'

export default defineConfig({
  adapter: node({ mode: 'standalone' }),
  integrations: [cards()],
})
