import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    silent: 'passed-only',
    testTimeout: 60000,
    hookTimeout: 60000,
    setupFiles: ['./test/setup.ts'],
    globalSetup: ['./test/global-setup.ts'],
  },
})
