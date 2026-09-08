import { toMatchImageSnapshot } from 'jest-image-snapshot'
import { expect } from 'vitest'

expect.extend({
  toMatchImageSnapshot(received, options) {
    return toMatchImageSnapshot.call(this as never, received, {
      failureThreshold: 0.002,
      failureThresholdType: 'percent',
      ...options,
    })
  },
})
