import { appendForwardSlash } from '@astrojs/internal-helpers/path'
import { isRemoteAllowed } from '@astrojs/internal-helpers/remote'
import {
  defaultMaxFetchBytes,
  type FetchLike,
  type FontSubset,
  fetchOk,
  googleFonts,
  type Node,
  readBodyLimited,
} from '@takumi-rs/helpers'
import { fromHtml } from '@takumi-rs/helpers/html'
import { type RenderOptions, render } from 'takumi-js'
import type { CardOptions } from './card.js'

export type PendingCard = Required<CardOptions> & { name: string; markup: string }

export interface RenderEnv {
  origin: string
  base: string
  imageConfig: Parameters<typeof isRemoteAllowed>[1]
  /** Every configured CDN prefix: Astro maps them per file extension. */
  assetsPrefix?: string[]
  /** During a build the output directory is on disk and nothing serves it. */
  readLocal?: (pathname: string) => Promise<Uint8Array>
  /** Replaces the fetch used for anything not read locally, so a build can see what came back. */
  fetch?: FetchLike
}

const URL_FUNCTION = /url\(\s*(['"]?)(.*?)\1\s*\)/g
const COMMENT = /\/\*[\s\S]*?\*\//g
const FONT_FACE = /@font-face\s*\{([^}]*)\}/g

/** Finds every image a card references, mapping the raw source to an absolute URL. */
export function collectSources(node: Node, css: string[], base: string): Map<string, string> {
  const found = new Map<string, string>()

  const add = (raw: string, value = raw) => {
    if (value.startsWith('data:') || value.startsWith('#')) return
    const url = new URL(value, base)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error(`unsupported image URL "${value}"`)
    }
    found.set(raw, url.href)
  }

  const scan = (value: unknown) => {
    if (typeof value !== 'string') return
    for (const match of value.matchAll(URL_FUNCTION)) {
      const url = match[2]?.trim()
      if (url) add(url)
    }
  }

  const visit = (node: Node) => {
    for (const value of Object.values(node.style ?? {})) scan(value)
    for (const value of Object.values(node.preset ?? {})) scan(value)
    scan(node.tw)
    // Takumi copies `src` raw but decodes entities into `attributes`, as it does for text.
    if (node.type === 'image' && typeof node.src === 'string') add(node.src, node.attributes?.src)
    if (node.type === 'container') for (const child of node.children ?? []) visit(child)
  }

  visit(node)
  for (const sheet of css) scan(sheet.replace(COMMENT, '').replace(FONT_FACE, ''))
  return found
}

const hasText = (node: Node): boolean => {
  if (node.type === 'text') return Boolean(node.text?.trim())
  return node.type === 'container' ? (node.children ?? []).some(hasText) : false
}

function parseUnicodeRange(value: string): [number, number][] {
  const ranges: [number, number][] = []
  for (const raw of value.split(',')) {
    const token = raw.trim().replace(/^U\+/i, '')
    if (!token) continue
    if (token.includes('-')) {
      const [lo, hi] = token.split('-')
      if (lo && hi) ranges.push([parseInt(lo, 16), parseInt(hi, 16)])
    } else if (token.includes('?')) {
      ranges.push([
        parseInt(token.replaceAll('?', '0'), 16),
        parseInt(token.replaceAll('?', 'F'), 16),
      ])
    } else {
      const codepoint = parseInt(token, 16)
      ranges.push([codepoint, codepoint])
    }
  }
  return ranges
}

function hash(value: string) {
  let h = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

type FontFace = Omit<FontSubset, 'data'> & { url: string }

/** Adapted from the parser inside `googleFonts` in `@takumi-rs/helpers` 2.13.5 (MIT). */
export function collectFonts(css: string[], base: string): FontFace[] {
  const faces: {
    family: string
    subset: string
    url: string
    weight?: number
    style?: string
    ranges: [number, number][]
  }[] = []

  for (const sheet of css) {
    for (const [, body] of sheet.replace(COMMENT, '').matchAll(FONT_FACE)) {
      const url = body
        ?.match(/src:[^;]*?url\(([^)]+)\)/)?.[1]
        ?.replace(/['"]/g, '')
        .trim()
      const family = body?.match(/font-family:\s*['"]?([^'";]+)['"]?/)?.[1]?.trim()
      if (!body || !url || !family) continue
      const range = body.match(/unicode-range:\s*([^;]+)/)?.[1]
      const weight = body.match(/font-weight:\s*(\d+)(?:\s+(\d+))?/)
      const ranges = parseUnicodeRange(range ?? '')
      faces.push({
        family,
        subset: `s${hash(ranges.map(([lo, hi]) => `${lo}-${hi}`).join(','))}`,
        url: new URL(url, base).href,
        // Two numbers mark a variable font, whose axis serves every weight.
        weight: weight && !weight[2] ? Number(weight[1]) : undefined,
        style: body.match(/font-style:\s*([a-z]+)/i)?.[1],
        ranges,
      })
    }
  }

  // A variable font lists one file once per weight; registered once, weightless, it serves them all.
  const identity = (face: (typeof faces)[number]) =>
    `${face.family} ${face.subset}:${face.style ?? ''}:${face.url}`
  const weights = new Map<string, Set<number | undefined>>()
  for (const face of faces) {
    const id = identity(face)
    weights.set(id, (weights.get(id) ?? new Set()).add(face.weight))
  }
  const seen = new Set<string>()
  const merged = []
  for (const face of faces) {
    const id = identity(face)
    if (seen.has(id)) continue
    seen.add(id)
    merged.push((weights.get(id)?.size ?? 0) > 1 ? { ...face, weight: undefined } : face)
  }

  return merged.map(({ family, subset, ...face }) => ({
    name: `${family} ${subset}`,
    subsetOf: family,
    // Lowest codepoint first puts `latin` before the subsets whose cmaps also encode Latin capitals.
    subsetRank: face.ranges.length ? Math.min(...face.ranges.map(([lo]) => lo)) : 0xffffffff,
    key: `${family} ${subset}:${face.weight ?? ''}:${face.style ?? ''}:${face.url}`,
    ...face,
  }))
}

export async function rasterise(card: PendingCard, env: RenderEnv): Promise<Uint8Array> {
  const cdns = (env.assetsPrefix ?? []).map((prefix) => new URL(appendForwardSlash(prefix)))
  const findCdn = (url: URL) => cdns.find((cdn) => url.href.startsWith(cdn.href))

  const resolve: FetchLike = async (url, init) => {
    const absolute = new URL(url, env.origin)
    if (env.readLocal) {
      const cdn = findCdn(absolute)
      let pathname: string | undefined
      if (cdn) {
        pathname = absolute.pathname.slice(cdn.pathname.length - 1)
      } else if (absolute.origin === env.origin) {
        pathname = absolute.pathname
      }
      if (pathname !== undefined) {
        return new Response((await env.readLocal(decodeURIComponent(pathname))) as BodyInit)
      }
    }
    return (env.fetch ?? fetch)(absolute.href, init)
  }

  const allowUrl = (url: string) => {
    const parsed = URL.parse(url)
    if (!parsed) return false
    if (parsed.origin === env.origin || findCdn(parsed)) return true
    return isRemoteAllowed(url, env.imageConfig)
  }

  try {
    const { node, css } = fromHtml(card.markup)
    const base = new URL(appendForwardSlash(env.base), env.origin).href

    const fonts: FontSubset[] = collectFonts(css, base).map(({ url, ...face }) => ({
      ...face,
      data: () =>
        fetchOk(url, { fetch: resolve }).then((r) => readBodyLimited(r, defaultMaxFetchBytes)),
    }))

    // Takumi has no fonts of its own, so text in a card that declares none would draw nothing.
    if (!fonts.length && hasText(node)) {
      const name = 'Noto Sans'
      const fallback = await googleFonts([{ name, weight: '100..900' }]).catch((cause: unknown) => {
        const message = cause instanceof Error ? cause.message : String(cause)
        throw new Error(`error fetching ${name} from Google Fonts: ${message}`, { cause })
      })
      if (!fallback.length) throw new Error(`Google Fonts returned no faces for ${name}`)
      fonts.push(...fallback)
    }

    const sources = []
    for (const [src, url] of collectSources(node, css, base)) {
      const data = async () =>
        readBodyLimited(await fetchOk(url, { fetch: resolve, allowUrl }), defaultMaxFetchBytes)
      sources.push({ src, data })
    }

    return await render(node, {
      width: card.width,
      height: card.height,
      format: card.format,
      quality: card.quality,
      fonts,
      css,
      images: { sources, fetch: resolve, allowUrl },
    } as RenderOptions)
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    throw new Error(`astro-cards: card "${card.name}" failed: ${message}`, { cause })
  }
}
