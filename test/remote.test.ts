import { once } from 'node:events'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { loadFixture } from './utils.js'

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

let server: Server
let requested: string[] = []

beforeAll(async () => {
  server = createServer((request, response) => {
    requested.push(request.url ?? '')
    response.writeHead(200, { 'content-type': 'image/png' })
    response.end(PNG)
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  process.env.REMOTE_IMAGE = `http://127.0.0.1:${(server.address() as AddressInfo).port}/photo.png`
})

afterAll(() => {
  server.close()
})

test('fetches a remote image the image config allows', async () => {
  requested = []
  const fixture = await loadFixture('remote', { image: { domains: ['127.0.0.1'] } })

  await fixture.build()

  expect(requested).toContain('/photo.png')
})

test('refuses a remote image the image config does not allow', async () => {
  requested = []
  const fixture = await loadFixture('remote')

  await expect(fixture.build()).rejects.toThrow(/card "remote" failed/)
  expect(requested).toEqual([])
})
