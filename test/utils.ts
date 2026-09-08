import { readdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { type AddressInfo, createServer } from 'node:net'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { AstroInlineConfig, AstroUserConfig } from 'astro'

export const TEMP = join(import.meta.dirname, '../node_modules/.astro-cards-test')

function freePort() {
  return new Promise<number>((resolve, reject) => {
    const server = createServer()
    // Below every OS's ephemeral range, so nothing binding port 0 can take it in the gap.
    const attempt = () =>
      server.listen(1024 + Math.floor(Math.random() * (32768 - 1024)), '127.0.0.1')
    server.on('listening', () => {
      const { port } = server.address() as AddressInfo
      server.close()
      resolve(port)
    })
    server.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') attempt()
      else reject(error)
    })
    attempt()
  })
}

/** Drives a fixture with its own Astro and adapter. `inline` overrides its config. */
export async function loadFixture(name: string, inline: AstroInlineConfig = {}) {
  const root = join(import.meta.dirname, 'fixtures', name)
  const astro = createRequire(join(root, 'package.json')).resolve('astro')
  const { build, preview }: typeof import('astro') = await import(pathToFileURL(astro).href)
  const { default: config }: { default: AstroUserConfig } = await import(
    pathToFileURL(join(root, 'astro.config.ts')).href
  )

  const temp = join(TEMP, `${name}-${Math.random().toString(36).slice(2)}`)
  const outDir = join(temp, 'dist')
  const port = await freePort()

  const inlineConfig: AstroInlineConfig = {
    root,
    configFile: false,
    logLevel: 'error',
    ...config,
    server: { host: '127.0.0.1', port },
    site: `http://127.0.0.1:${port}`,
    outDir,
    cacheDir: join(temp, 'cache'),
    vite: {
      cacheDir: join(temp, 'vite'),
      preview: { strictPort: true },
    },
    ...inline,
  }

  return {
    cacheDir: join(temp, 'cache', 'astro-cards'),
    build: () => build(inlineConfig),
    preview: () => preview(inlineConfig),
    fetch: (path: string) => fetch(new URL(path, inlineConfig.site)),
    readdir: (path: string) => readdir(join(outDir, path)),
    readFile: (path: string) => readFile(join(outDir, path)),
    readJson: (path: string) => readFile(join(outDir, path), 'utf-8').then(JSON.parse),
  }
}

export type Fixture = Awaited<ReturnType<typeof loadFixture>>
