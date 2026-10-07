import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: process.env.BASE_PATH || '/SoosisGame/',
  plugins: [react()],
  optimizeDeps: {
    exclude: ['shared'],
  },
  server: {
    port: 5173,
  },
});
