import { cards, config } from 'virtual:astro-cards'
import {
  joinPaths,
  prependForwardSlash,
  removeTrailingForwardSlash,
} from '@astrojs/internal-helpers/path'
import type { ComponentProps } from 'astro/types'
import { type CardOptions, loadCard } from './card.js'
import { encodePayload } from './payload.js'
import type { PendingCard } from './render.js'

export interface CardResult {
  src: string
  width: number
  height: number
  type: string
}

/** The project's cards, filled in by the declaration `astro sync` generates. */
// biome-ignore lint/suspicious/noEmptyInterface: only an interface can merge with that declaration
export interface Cards {}

// biome-ignore lint/suspicious/noControlCharactersInRegex: Astro's image filename set, copied verbatim
const INVALID_CHAR_REGEX = /[\u0000-\u001F"#$%&*+,:;<=>?[\]^`{|}\u007F]/g

const COLLECTOR = Symbol.for('astro-cards.collector')
const globals = globalThis as { [COLLECTOR]?: string }

/** Resolves a card to what a page embeds: its `src`, size and MIME type. */
export async function renderCard<K extends keyof Cards & string>(
  name: K,
  props: ComponentProps<Cards[K]>,
  options: CardOptions = {},
): Promise<CardResult> {
  if (!Object.hasOwn(cards, name)) {
    const known = Object.keys(cards).join(', ')
    throw new Error(`astro-cards: no card named "${name}". Known cards: ${known || '(none)'}`)
  }

  const { options: resolved, ext, type, render } = await loadCard(name, options)

  // Baked into the prerender bundle, or set by the build process when that bundle cannot tell.
  const collector = config.collector ?? globals[COLLECTOR]
  if (collector) {
    const markup = await render(props)
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(JSON.stringify({ markup, ...resolved })),
    )
    const hash = Array.from(new Uint8Array(digest, 0, 10), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('')
    const key = name as string
    const base = key.slice(key.lastIndexOf('/') + 1)
    const file = `${base.replace(INVALID_CHAR_REGEX, '_')}.${hash}.${ext}`

    const card: PendingCard = { name, markup, ...resolved }
    await fetch(new URL(file, collector), { method: 'POST', body: JSON.stringify(card) })

    const path = prependForwardSlash(joinPaths(config.assetsDir, file))
    const prefix =
      typeof config.assetsPrefix === 'string'
        ? config.assetsPrefix
        : config.assetsPrefix?.[ext] || config.assetsPrefix?.fallback
    const src = prefix
      ? `${removeTrailingForwardSlash(prefix)}${path}`
      : joinPaths(config.base, path)
    return { src, width: resolved.width, height: resolved.height, type }
  }

  const payload = await encodePayload({ name, props, ...options })
  const src = joinPaths(config.base, '_cards')
  return { src: `${src}?p=${payload}`, width: resolved.width, height: resolved.height, type }
}
