import { cards, config } from 'virtual:astro-cards'
import { experimental_AstroContainer } from 'astro/container'

export const FORMATS = ['png', 'jpeg', 'webp'] as const

export type Format = (typeof FORMATS)[number]

export interface CardOptions {
  /** Pixel width of the image. Defaults to 1200. */
  width?: number
  /** Pixel height of the image. Defaults to 630. */
  height?: number
  /** Image encoding. Defaults to `jpeg`. */
  format?: Format
  /** Encoder quality from 0 to 100 for lossy formats. Defaults to 90. */
  quality?: number
}

const EXT: Record<Format, string> = { png: 'png', jpeg: 'jpg', webp: 'webp' }

const container = await experimental_AstroContainer.create()

export async function loadCard(name: string, overrides: CardOptions) {
  const module = await cards[name]()
  const card = module.card ?? {}
  const format = overrides.format ?? card.format ?? config.format
  return {
    options: {
      width: overrides.width ?? card.width ?? config.width,
      height: overrides.height ?? card.height ?? config.height,
      format,
      quality: overrides.quality ?? card.quality ?? config.quality,
    },
    ext: EXT[format],
    type: `image/${format}`,
    render: (props: Record<string, unknown>) => container.renderToString(module.default, { props }),
  }
}
