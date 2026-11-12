import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const ROOT: string = import.meta.dirname;

export default defineConfig({
  server: { port: 5193, open: false },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      input: {
        landing: resolve(ROOT, 'index.html'),
        play: resolve(ROOT, 'play/index.html'),
      },
    },
  },
});
