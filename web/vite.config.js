import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Keeps the browser on one origin in dev: /api and /static hit the Node API.
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      '/static': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
