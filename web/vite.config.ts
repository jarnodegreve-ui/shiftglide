import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  resolve: {
    alias: {
      '@shiftglide': resolve(__dirname, '../src'),
    },
  },
  server: {
    port: 5173,
    open: false,
  },
  build: {
    outDir: resolve(__dirname, '../dist-web'),
    emptyOutDir: true,
  },
});
