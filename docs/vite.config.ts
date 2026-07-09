import { defineConfig } from 'vite';

// Served from https://frsgit.github.io/babylon-box3d/ (a project page, not a
// user/org page), so every asset URL needs the repo name as a base path.
export default defineConfig({
  base: '/babylon-box3d/',
  build: {
    outDir: 'dist',
  },
});
