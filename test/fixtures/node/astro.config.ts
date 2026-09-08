import node from '@astrojs/node'
import { defineConfig, fontProviders } from 'astro/config'
import cards from 'astro-cards'

export default defineConfig({
  adapter: node({ mode: 'standalone' }),
  integrations: [cards()],
  fonts: [
    {
      provider: fontProviders.fontsource(),
      name: 'Roboto',
      cssVariable: '--font-test',
      weights: [400, 700],
      styles: ['normal'],
      subsets: ['latin', 'cyrillic', 'greek'],
    },
  ],
})
