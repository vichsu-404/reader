import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Two projects because the environments genuinely differ.
//
// core runs in Node: the DB layer imports node:sqlite, which Vite refuses to
// bundle into a client environment. Ingest lives here too — it needs a
// DOMParser, which the setup file borrows from jsdom, and that is far cheaper
// than moving the database somewhere it cannot go.
//
// renderer runs in jsdom for React, and needs a crypto.subtle shim because
// jsdom ships none and every unit_id hash depends on it.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'core',
          environment: 'node',
          include: ['src/core/**/*.test.ts', 'src/main/**/*.test.ts'],
          setupFiles: ['src/test-setup-node.ts'],
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'renderer',
          environment: 'jsdom',
          include: ['src/renderer/**/*.test.{ts,tsx}'],
          setupFiles: ['src/test-setup-dom.ts'],
        },
      },
    ],
  },
});
