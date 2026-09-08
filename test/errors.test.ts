import { expect, test } from 'vitest'
import { loadFixture } from './utils.js'

test('a card that cannot be rendered fails the build, naming the card', async () => {
  const fixture = await loadFixture('errors')

  await expect(fixture.build()).rejects.toThrow(/card "bad" failed.*ENOENT/s)
})
