import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:4179',
      '/socket.io': { target: 'http://127.0.0.1:4179', ws: true },
      '/uploads': 'http://127.0.0.1:4179',
    },
  },
});
