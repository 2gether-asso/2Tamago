import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defaultClientConditions, defaultServerConditions } from 'vite';
import { defineConfig } from 'vitest/config';

const API_TARGET = process.env.API_URL ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [
    sveltekit({
      compilerOptions: {
        runes: ({ filename }) =>
          filename.split(/[/\\]/).includes('node_modules') ? undefined : true,
      },
      // Single-page app: GitHub Pages serves 404.html for every unknown route, which lets the router take over.
      adapter: adapter({ fallback: '404.html' }),
    }),
  ],
  resolve: {
    // Use the TypeScript sources of @2tamago/core directly (no rebuild, HMR).
    conditions: ['@2tamago/source', ...defaultClientConditions],
  },
  ssr: {
    // The build also renders the fallback page on the server side.
    noExternal: ['@2tamago/core'],
    resolve: { conditions: ['@2tamago/source', ...defaultServerConditions] },
  },
  server: {
    // 4321 is the port forwarded by the devcontainer.
    port: 4321,
    host: true,
    // Same origin in development: no CORS, and the session cookie just works.
    proxy: { '/api': API_TARGET },
  },
  test: {
    include: ['src/**/*.spec.ts'],
  },
});
