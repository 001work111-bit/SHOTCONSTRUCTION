import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Local-first, no backend. The dev server must be reachable both on localhost
// and through a remote preview proxy / LAN address, hence host + allowedHosts.
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: true,
    cors: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: true,
    allowedHosts: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2022',
  },
});
