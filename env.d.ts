/// <reference types="astro/client" />

declare module 'virtual:astro-cards' {
  import type { AstroComponentFactory } from 'astro/runtime/server/index.js'

  export const cards: Record<
    string,
    () => Promise<{ default: AstroComponentFactory; card?: import('./src/card.js').CardOptions }>
  >
  export const config: Required<import('./src/card.js').CardOptions> & {
    site?: string
    base: string
    assetsDir: string
    assetsPrefix?: import('astro').AstroConfig['build']['assetsPrefix']
    image: Pick<import('astro').AstroConfig['image'], 'domains' | 'remotePatterns'>
    /** Where the build listens for cards to emit; present in the prerender bundle only. */
    collector?: string
  }
}
