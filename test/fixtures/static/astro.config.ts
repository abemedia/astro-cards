import { defineConfig, fontProviders } from 'astro/config'
import cards from 'astro-cards'

export default defineConfig({
  integrations: [cards()],
  fonts: [
    {
      provider: fontProviders.fontsource(),
      name: 'Roboto',
      cssVariable: '--font-test',
      weights: [400, 700],
      styles: ['normal'],
      // Three subsets exercise the `subsetOf` grouping.
      subsets: ['latin', 'cyrillic', 'greek'],
    },
  ],
})
