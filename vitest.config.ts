import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Each suite gets its own temp SQLite file, so serial execution is not
    // required - but a single fork keeps the output readable.
    pool: 'forks',
    // mammoth (.docx) is a heavy dynamic import - the first test that touches it
    // spends several seconds loading the module before any assertion runs.
    testTimeout: 20000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
