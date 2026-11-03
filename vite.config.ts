import { defineConfig } from 'vitest/config';

// GitHub Pages serves a project site under /<repo-name>/. The deploy workflow sets BASE_PATH
// from the repository name, so renaming the repo needs no code change.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
