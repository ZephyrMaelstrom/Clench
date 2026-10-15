import { defineConfig } from 'vite';

// base './' makes the build work at any GitHub Pages sub-path (e.g. /Clench/).
export default defineConfig({
  base: './',
  build: { outDir: 'dist', assetsInlineLimit: 0, chunkSizeWarningLimit: 2000 },
  test: { include: ['tests/**/*.test.ts'] },
});
