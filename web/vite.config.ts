import adapter from '@sveltejs/adapter-static';
import type { Config } from '@sveltejs/kit/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defaultClientConditions, defaultServerConditions } from 'vite';
import { defineConfig } from 'vitest/config';

const API_TARGET = process.env.API_URL ?? 'http://localhost:3000';

/**
 * Content-Security-Policy of the built app (a <meta> tag: static hosting sets no headers).
 * The session token lives in localStorage, so the aim is to make script injection and token
 * exfiltration hard: only our own scripts run, and the page can only talk to the API (plus
 * `CSP_CONNECT_SRC`: extra origins, space-separated, e.g. the Sentry/GlitchTip host of the DSN).
 */
type Directives = NonNullable<NonNullable<Config['csp']>['directives']>;

function csp(): NonNullable<Config['csp']> {
  const connect = [
    "'self'",
    ...(process.env.VITE_API_URL ? [new URL(process.env.VITE_API_URL).origin] : []),
    ...(process.env.CSP_CONNECT_SRC ?? '').split(/\s+/).filter(Boolean),
  ];
  return {
    mode: 'hash',
    directives: {
      'default-src': ['none'],
      'script-src': ['self'],
      'connect-src': connect as Directives['connect-src'],
      'img-src': ['self', 'data:', 'https://cdn.discordapp.com'],
      'style-src': ['self', 'unsafe-inline'],
      'font-src': ['self', 'data:'],
      'manifest-src': ['self'],
      'object-src': ['none'],
      'base-uri': ['self'],
      'form-action': ['self'],
    },
  };
}

export default defineConfig(({ command }) => ({
  plugins: [
    sveltekit({
      compilerOptions: {
        runes: ({ filename }) =>
          filename.split(/[/\\]/).includes('node_modules') ? undefined : true,
      },
      // Single-page app: GitHub Pages serves 404.html for every unknown route, which lets the router take over.
      adapter: adapter({ fallback: '404.html' }),
      // Not in development: Vite's hot reload needs inline scripts and a websocket.
      ...(command === 'build' ? { csp: csp() } : {}),
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
}));
