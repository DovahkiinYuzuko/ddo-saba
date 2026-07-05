import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: path.resolve(__dirname, '../nginx/html'),
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8088',
        changeOrigin: true,
      }
    }
  },
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/tests/**'],
  }
});
