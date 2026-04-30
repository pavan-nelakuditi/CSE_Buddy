import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist-renderer'
  },
  test: {
    environment: 'jsdom',
    setupFiles: './tests/setup.ts'
  }
});
