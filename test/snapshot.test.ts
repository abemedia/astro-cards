import cards, { type CardResult } from 'astro-cards'
import { beforeAll, describe, expect, test } from 'vitest'
import { type Fixture, loadFixture } from './utils.js'

describe('rendered output', () => {
  let fixture: Fixture
  let results: Record<string, CardResult>

  beforeAll(async () => {
    fixture = await loadFixture('static', { integrations: [cards({ format: 'png' })] })
    await fixture.build()
    results = await fixture.readJson('index.json')
  })

  const bytes = (id: string) => fixture.readFile(results[id].src)

  test('text, in a real font across three scripts', async () => {
    expect(await bytes('text')).toMatchImageSnapshot({ customSnapshotIdentifier: 'card-text' })
  })

  test('the same bytes through a fontsource stylesheet inlined into the card', async () => {
    expect((await bytes('fontsource')).equals(await bytes('text'))).toBe(true)
  })

  test('the same bytes through hand-written faces served from public', async () => {
    expect((await bytes('manual')).equals(await bytes('text'))).toBe(true)
  })

  test('a tint driven by a prop', async () => {
    expect(await bytes('tinted')).toMatchImageSnapshot({ customSnapshotIdentifier: 'card-tinted' })
  })

  test('an image composited through the pipeline', async () => {
    expect(await bytes('image')).toMatchImageSnapshot({ customSnapshotIdentifier: 'card-image' })
  })

  test('an image referenced by bare path, shorthand background and style block', async () => {
    expect(await bytes('sources')).toMatchImageSnapshot({
      customSnapshotIdentifier: 'card-sources',
    })
  })

  test('the CSS surface takumi supports', async () => {
    expect(await bytes('styled')).toMatchImageSnapshot({ customSnapshotIdentifier: 'card-styled' })
  })

  test('a size override smaller than the card declares', async () => {
    expect(await bytes('cropped')).toMatchImageSnapshot({
      customSnapshotIdentifier: 'card-cropped',
    })
  })
})
