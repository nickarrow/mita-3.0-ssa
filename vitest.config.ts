import { defineConfig } from 'vitest/config'

/**
 * Test config, deliberately separate from vite.config.ts.
 *
 * The app config aliases jsPDF's optional dependencies to a stub and registers the
 * PWA plugin; neither is wanted under test. Sharing one config would mean the tests
 * exercising the export services ran against a different module graph than the app
 * uses for everything else.
 *
 * The real blueprint service is used rather than a stub. It eagerly glob-imports
 * the BCM/BPT JSON, which vitest handles, and question counts are load-bearing for
 * the validation and progress logic under test — a stub would let those assertions
 * pass against numbers the app never sees.
 */
export default defineConfig({
  test: {
    // Dexie needs an IndexedDB implementation. fake-indexeddb provides a real,
    // spec-compliant in-memory one, so the data-layer tests exercise the same
    // Dexie code paths the browser does, including transactions and index queries.
    setupFiles: ['./src/test/setup.ts'],
    environment: 'node',
    include: ['src/**/*.test.ts'],
    restoreMocks: true,
  },
})
