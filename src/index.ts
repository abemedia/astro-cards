import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { writeFileSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { availableParallelism } from 'node:os'
import { join, relative, sep } from 'node:path'
import { json } from 'node:stream/consumers'
import { fileURLToPath } from 'node:url'
import { styleText } from 'node:util'
import { isParentDirectory, stripRequestBase } from '@astrojs/internal-helpers/path'
import type { AstroConfig, AstroIntegration } from 'astro'
import type { CardOptions } from './card.js'
import type { PendingCard } from './render.js'

export type { CardOptions, Format } from './card.js'
export type { CardResult } from './runtime.js'

export interface CardsOptions extends CardOptions {
  /** Where the card components live, relative to the project root. Defaults to `src/cards`. */
  dir?: string
}

const ID = 'virtual:astro-cards'

// Only keys resolution back to the output directory when `site` is unset.
const FALLBACK_ORIGIN = 'https://localhost'

const COLLECTOR = Symbol.for('astro-cards.collector')
const globals = globalThis as { [COLLECTOR]?: string }

const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

/** What a cached card was rendered from, so a later build can tell whether it still holds. */
interface Dependency {
  sha: string
  /** Remote only, to revalidate the way Astro's image cache does rather than re-download. */
  etag?: string
  modified?: string
  expires?: number
}

export default function cards(options: CardsOptions = {}): AstroIntegration {
  let found: { name: string; path: string }[] = []
  let astroConfig: AstroConfig
  let assetsPrefix: AstroConfig['build']['assetsPrefix']
  let collector: Server | undefined
  let cardsDir: string
  let trigger: string | undefined
  const pending = new Map<string, PendingCard>()

  return {
    name: 'astro-cards',
    hooks: {
      async 'astro:config:setup'({
        addWatchFile,
        command,
        config,
        createCodegenDir,
        injectRoute,
        updateConfig,
      }) {
        cardsDir = fileURLToPath(new URL(`${options.dir ?? 'src/cards'}/`, config.root))
        const entries = await readdir(cardsDir, { recursive: true, withFileTypes: true }).catch(
          (error: NodeJS.ErrnoException) => {
            if (error.code !== 'ENOENT') throw error
            return []
          },
        )
        found = entries
          .filter((entry) => entry.isFile() && entry.name.endsWith('.astro'))
          .map((entry) => {
            const path = join(entry.parentPath, entry.name)
            // Card names are posix-style regardless of platform, like route paths.
            const name = relative(cardsDir, path)
              .replace(/\.astro$/, '')
              .split(sep)
              .join('/')
            return { path, name }
          })
          .sort((a, b) => a.name.localeCompare(b.name))

        // Prerendering may run outside this process, so cards reach the build over HTTP.
        let url: string | undefined
        if (command === 'build') {
          pending.clear()
          collector = createServer(async (request, response) => {
            const file = decodeURIComponent((request.url ?? '/').slice(1))
            pending.set(file, (await json(request)) as PendingCard)
            response.end()
          })
          collector.listen(0, '127.0.0.1').unref()
          await once(collector, 'listening')
          url = `http://127.0.0.1:${(collector.address() as AddressInfo).port}/`
          // Astro 5 prerenders from the bundle it deploys, so only this process can say a build is on.
          globals[COLLECTOR] = url
        }

        // Touched when the set of cards changes, so dev picks up the new set.
        if (command === 'dev') {
          trigger = fileURLToPath(new URL('restart', createCodegenDir()))
          addWatchFile(trigger)
        }

        assetsPrefix = config.build.assetsPrefix

        updateConfig({
          vite: {
            plugins: [
              {
                name: 'astro-cards:virtual',
                enforce: 'pre',
                resolveId: (id: string) => (id === ID ? `\0${ID}` : undefined),
                load(this: { environment?: { name: string } }, id: string) {
                  if (id !== `\0${ID}`) return
                  const cardsConfig = {
                    width: options.width ?? 1200,
                    height: options.height ?? 630,
                    format: options.format ?? 'jpeg',
                    quality: options.quality ?? 90,
                    site: command === 'dev' ? undefined : config.site,
                    base: config.base,
                    assetsDir: config.build.assets,
                    assetsPrefix,
                    image: {
                      domains: config.image.domains,
                      remotePatterns: config.image.remotePatterns,
                    },
                    // Only the prerender bundle reports cards; the same code serves on demand elsewhere.
                    collector: this.environment?.name === 'prerender' ? url : undefined,
                  } satisfies typeof import('virtual:astro-cards')['config']
                  return [
                    'export const cards = {',
                    ...found.map(
                      ({ name, path }) =>
                        `  ${JSON.stringify(name)}: () => import(${JSON.stringify(path)}),`,
                    ),
                    '}',
                    `export const config = ${JSON.stringify(cardsConfig)}`,
                  ].join('\n')
                },
              },
            ],
          },
        })

        // Forcing an on-demand route would make an adapter mandatory.
        if (command === 'dev' || config.output === 'server' || config.adapter) {
          injectRoute({
            pattern: '/_cards',
            entrypoint: new URL('./endpoint.js', import.meta.url),
            prerender: false,
          })
        }
      },

      async 'astro:config:done'({ config, injectTypes }) {
        astroConfig = config

        const entries = found
          .map(
            ({ name, path }) =>
              `    ${JSON.stringify(name)}: typeof import(${JSON.stringify(path)}).default`,
          )
          .join('\n')

        const content = `export {}\ndeclare module 'astro-cards/runtime' {\n  interface Cards {\n${entries}\n  }\n}\n`
        const types = injectTypes({ filename: 'cards.d.ts', content })

        // A dev reload re-runs this hook but not the sync that writes the types.
        if (trigger) await writeFile(types, content)
      },

      'astro:server:setup'({ server }) {
        const touch = (file: string) => {
          if (trigger && file.endsWith('.astro') && isParentDirectory(cardsDir, file)) {
            writeFileSync(trigger, String(Date.now()))
          }
        }
        server.watcher.on('add', touch).on('unlink', touch)
      },

      async 'astro:build:done'({ dir, logger }) {
        collector?.close()
        delete globals[COLLECTOR]
        if (!pending.size) return

        logger.info(styleText(['bgGreen', 'black'], ' generating cards '))

        const { rasterise } = await import('./render.js')
        const root = fileURLToPath(dir)
        const readLocal = (pathname: string) => {
          const file = join(root, stripRequestBase(pathname, astroConfig.base))
          if (!isParentDirectory(root, file)) {
            throw new Error(`refusing to read outside the output directory: ${pathname}`)
          }
          return readFile(file)
        }
        const env = {
          origin: astroConfig.site ? new URL(astroConfig.site).origin : FALLBACK_ORIGIN,
          base: astroConfig.base,
          imageConfig: astroConfig.image,
          assetsPrefix:
            typeof assetsPrefix === 'string' ? [assetsPrefix] : Object.values(assetsPrefix ?? {}),
          readLocal,
        }

        const outDir = new URL(`./${astroConfig.build.assets}/`, dir)
        const cacheDir = new URL('astro-cards/', astroConfig.cacheDir)
        await mkdir(outDir, { recursive: true })
        await mkdir(cacheDir, { recursive: true })

        // The filename hashes markup and options, so only what they point at needs tracking here.
        const unchanged = async (key: string, dep: Dependency) => {
          if (!URL.canParse(key)) return sha(await readLocal(key)) === dep.sha
          if (dep.expires && dep.expires > Date.now()) return true

          const response = await fetch(key, {
            method: 'HEAD',
            headers: {
              ...(dep.etag && { 'if-none-match': dep.etag }),
              ...(dep.modified && { 'if-modified-since': dep.modified }),
            },
            signal: AbortSignal.timeout(30_000),
            redirect: 'manual',
          })
          return response.status === 304
        }

        const reuse = async (file: string) => {
          const deps = await readFile(new URL(`./${file}.json`, cacheDir), 'utf-8')
            .then((json): Record<string, Dependency> => JSON.parse(json))
            .catch(() => undefined)
          if (!deps) return undefined

          // A dependency that cannot be read at all is as stale as one that changed.
          const checks = Object.entries(deps).map(([key, dep]) => unchanged(key, dep))
          if (!(await Promise.all(checks).catch(() => [false])).every(Boolean)) return undefined
          return readFile(new URL(`./${file}`, cacheDir)).catch(() => undefined)
        }

        let done = 0
        const emit = async (file: string, card: PendingCard) => {
          const started = performance.now()
          const log = (bytes: Uint8Array, cached?: boolean) => {
            const ms = performance.now() - started
            const took = ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`
            const size = `${Math.round(bytes.length / 1024)}kB`
            const detail = `(${size}) ${cached ? '(cached) ' : ''}(${took}) (${++done}/${pending.size})`
            logger.info(
              `  ${styleText('green', '▶')} /${astroConfig.build.assets}/${file} ${styleText('dim', detail)}`,
            )
          }

          const hit = await reuse(file)
          if (hit) {
            await writeFile(new URL(`./${file}`, outDir), hit)
            return log(hit, true)
          }

          const deps = new Map<string, Dependency>()
          const bytes = await rasterise(card, {
            ...env,
            readLocal: async (pathname) => {
              const read = await readLocal(pathname)
              // A changed asset renames the card file, so the cache misses without tracking it.
              const path = stripRequestBase(pathname, astroConfig.base)
              if (!path.startsWith(`/${astroConfig.build.assets}/`)) {
                deps.set(pathname, { sha: sha(read) })
              }
              return read
            },
            // Buffered so the bytes can be hashed and still handed on to the renderer.
            fetch: async (url, init) => {
              const response = await fetch(url, init)
              if (!response.ok) return response
              const body = await response.bytes()
              const maxAge = response.headers.get('cache-control')?.match(/max-age=(\d+)/)?.[1]
              deps.set(String(url), {
                sha: sha(body),
                etag: response.headers.get('etag') ?? undefined,
                modified: response.headers.get('last-modified') ?? undefined,
                expires: maxAge ? Date.now() + Number(maxAge) * 1000 : undefined,
              })
              return new Response(body as BodyInit, {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers,
              })
            },
          })
          await writeFile(new URL(`./${file}`, outDir), bytes)
          await writeFile(new URL(`./${file}`, cacheDir), bytes)
          await writeFile(
            new URL(`./${file}.json`, cacheDir),
            JSON.stringify(Object.fromEntries(deps)),
          )
          log(bytes)
        }

        const queue = pending.entries()
        const start = performance.now()
        await Promise.all(
          Array.from({ length: Math.min(availableParallelism(), pending.size) }, async () => {
            for (const [file, card] of queue) await emit(file, card)
          }),
        )

        const total = performance.now() - start
        const took = total < 1000 ? `${Math.round(total)}ms` : `${(total / 1000).toFixed(2)}s`
        logger.info(styleText('green', `✓ Completed in ${took}`))
      },
    },
  }
}
