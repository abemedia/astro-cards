import { z } from 'astro/zod'
import { parse, stringifyAsync } from 'devalue'
import { FORMATS } from './card.js'

const schema = z.strictObject({
  name: z.string(),
  props: z.record(z.string(), z.unknown()),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  format: z.enum(FORMATS).optional(),
  quality: z.number().min(0).max(100).optional(),
})

type CardPayload = z.infer<typeof schema>

// A 16kB URL holds at most ~80kB of real props, so this only stops a decompression bomb.
const MAX_DECODED = 128 * 1024

export async function encodePayload(payload: CardPayload): Promise<string> {
  const serialised = await stringifyAsync(payload).catch((cause: unknown) => {
    const message = cause instanceof Error ? cause.message : String(cause)
    throw new Error(
      `astro-cards: card "${payload.name}" got a prop it cannot serialise: ${message}`,
      { cause },
    )
  })

  const source = new Blob([serialised]).stream()
  const deflated = await new Response(
    source.pipeThrough(new CompressionStream('deflate-raw')),
  ).bytes()

  let binary = ''
  for (const byte of deflated) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

export async function decodePayload(value: string): Promise<CardPayload> {
  const binary = atob(value.replaceAll('-', '+').replaceAll('_', '/'))
  const source = new Blob([Uint8Array.from(binary, (char) => char.charCodeAt(0)) as BlobPart])
  let size = 0
  const decoded = await new Response(
    source
      .stream()
      .pipeThrough(new DecompressionStream('deflate-raw'))
      .pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller) {
            size += chunk.byteLength
            if (size > MAX_DECODED) throw new Error('payload is too large')
            controller.enqueue(chunk)
          },
        }),
      ),
  ).text()

  return schema.parse(parse(decoded))
}
