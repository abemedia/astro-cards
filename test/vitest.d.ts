import type { MatchImageSnapshotOptions } from 'jest-image-snapshot'

// `@types/jest-image-snapshot` augments Jest's globals, not Vitest's.
declare module 'vitest' {
  interface Matchers<R, T> {
    toMatchImageSnapshot(options?: MatchImageSnapshotOptions): R
  }
}
