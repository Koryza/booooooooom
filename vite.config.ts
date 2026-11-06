import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  root: 'client',
  plugins: [react()],
  build: { outDir: '../dist/client', emptyOutDir: true },
  server: {
    port: Number(process.env.CLIENT_PORT || 5173),
    strictPort: false,
    proxy: {
      '/socket.io': { target: `http://127.0.0.1:${process.env.PORT || 3001}`, ws: true },
      '/api': `http://127.0.0.1:${process.env.PORT || 3001}`,
    },
  },
});
