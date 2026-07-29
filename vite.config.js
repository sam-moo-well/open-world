import { defineConfig } from 'vite';

// The FBX assets live in assets/ (rig + animation clips). Serving that
// directory as Vite's publicDir means /character/... and /animations/...
// resolve straight to the committed binaries in dev and in dist builds.
export default defineConfig({
  base: './',
  publicDir: 'assets',
  server: { host: true },
  build: { chunkSizeWarningLimit: 1500 },
});
