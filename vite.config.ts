/// <reference types="vitest" />
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build` makes a normal multi-file build in dist/.
// `npm run build:single` inlines everything into one index.html (dist-single/),
// which is handy for sharing a playtest build as a single file.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'single' ? [viteSingleFile()] : [],
  // The single-file playtest build keeps readable names: the artifact host's publish checks
  // have tripped over runs of short mangled identifiers in the inlined script before.
  esbuild: mode === 'single' ? { minifyIdentifiers: false } : undefined,
  build: {
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    assetsInlineLimit: mode === 'single' ? 100_000_000 : 4096,
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
}));
