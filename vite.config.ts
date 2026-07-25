import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const host = process.env['TAURI_DEV_HOST'];

export default defineConfig({
  plugins: [react()],
  // Tauri reads TAURI_* / VITE_* only; keep the default plus Tauri's own prefix.
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    host: host ?? false,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  build: {
    target: 'es2023',
    sourcemap: true,
  },
});
