import cloudflare from '@astrojs/cloudflare'
import { defineConfig, fontProviders } from 'astro/config'
import cards from 'astro-cards'

export default defineConfig({
  adapter: cloudflare(),
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
