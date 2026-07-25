import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Two projects because the environments genuinely differ:
//   core — node:sqlite for the test DB driver, no DOM needed
//   dom  — ingest needs DOMParser, renderer needs a document; both need a
//          crypto.subtle shim, since jsdom ships none and every unit_id hash
//          depends on it.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'core',
          environment: 'node',
          include: [
            'src/core/db/**/*.test.ts',
            'src/core/coach/**/*.test.ts',
            'src/main/**/*.test.ts',
          ],
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: [
            'src/core/ingest/**/*.test.ts',
            'src/renderer/**/*.test.{ts,tsx}',
          ],
          setupFiles: ['src/test-setup.ts'],
        },
      },
    ],
  },
});
