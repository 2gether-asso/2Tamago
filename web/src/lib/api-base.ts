/**
 * The API lives on its own origin in production (`VITE_API_URL`, set at build time, for example
 * `https://api.example.org`). Without it the app uses the same origin: Vite proxies `/api` in development.
 */
export const BASE = `${(import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')}/api`;
