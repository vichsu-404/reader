import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// src/core runs under Node: it needs node:sqlite for the test DB driver, and
// jsdom ships no crypto.subtle, which every unit_id hash depends on.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'core',
          environment: 'node',
          include: ['src/core/**/*.test.ts', 'src/main/**/*.test.ts'],
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'renderer',
          environment: 'jsdom',
          include: ['src/renderer/**/*.test.{ts,tsx}'],
          setupFiles: ['src/renderer/test-setup.ts'],
        },
      },
    ],
  },
});
