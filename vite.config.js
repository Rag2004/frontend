import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function httpToWs(url) {
  if (url.startsWith('https')) return url.replace(/^https/, 'wss');
  return url.replace(/^http/, 'ws');
}

/** Dev proxy targets (override per server via dashboard/.env — see .env.mock-desk.example) */
function proxyTargets(mode) {
  const env = loadEnv(mode, __dirname, '');
  return {
    backend: env.DESK_PROXY_BACKEND || 'http://127.0.0.1:8010',
    portfolio: env.DESK_PROXY_PORTFOLIO || 'http://127.0.0.1:8011',
    rms: env.DESK_PROXY_RMS || 'http://127.0.0.1:8001',
    toeMock: env.DESK_PROXY_TOE_MOCK || 'http://127.0.0.1:8002',
    toeDhan: env.DESK_PROXY_TOE_DHAN || 'http://127.0.0.1:8003',
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '');
  const t = proxyTargets(mode);
  // Subpath hosting (e.g. host nginx serves app at /pnl/). Must match BrowserRouter basename.
  const rawBase = (env.VITE_BASE_PATH || '/').trim() || '/';
  const base = rawBase === '/' ? '/' : rawBase.endsWith('/') ? rawBase : `${rawBase}/`;
  const baseNoSlash = base === '/' ? '' : base.replace(/\/$/, '');
  // Windows often returns EACCES on 0.0.0.0 (reserved ranges / bind policy). Use 127.0.0.1 by default;
  // set VITE_DEV_SERVER_HOST=0.0.0.0 in dashboard/.env for LAN or tunnel access.
  const devHost = env.VITE_DEV_SERVER_HOST || '127.0.0.1';
  return {
    base,
    plugins: [react()],
    server: {
      host: devHost,
      port: Number(env.VITE_DEV_SERVER_PORT || 5173),
      strictPort: false,

      allowedHosts: ['.trycloudflare.com'],

      proxy: {
        '/health': {
          target: t.backend,
          changeOrigin: true,
          timeout: 10000,
        },
        '/api/portfolio': {
          target: t.portfolio,
          changeOrigin: true,
          timeout: 180000,
          proxyTimeout: 180000,
        },
        '/api': {
          target: t.backend,
          changeOrigin: true,
          timeout: 30000,
          proxyTimeout: 30000,
        },
        ...(baseNoSlash
          ? {
              [`${baseNoSlash}/health`]: {
                target: t.backend,
                changeOrigin: true,
                timeout: 10000,
              },
              [`${baseNoSlash}/api/portfolio`]: {
                target: t.portfolio,
                changeOrigin: true,
                timeout: 180000,
                proxyTimeout: 180000,
              },
              [`${baseNoSlash}/api`]: {
                target: t.backend,
                changeOrigin: true,
                timeout: 30000,
                proxyTimeout: 30000,
              },
              [`${baseNoSlash}/rms`]: {
                target: t.rms,
                changeOrigin: true,
                timeout: 30000,
              },
              [`${baseNoSlash}/toe`]: {
                target: t.toeMock,
                changeOrigin: true,
                timeout: 30000,
              },
              [`${baseNoSlash}/toe-dhan`]: {
                target: t.toeDhan,
                changeOrigin: true,
                timeout: 30000,
              },
              [`${baseNoSlash}/ws`]: {
                target: httpToWs(t.backend),
                ws: true,
                timeout: 30000,
              },
            }
          : {}),
        '/rms': {
          target: t.rms,
          changeOrigin: true,
          timeout: 30000,
        },
        '/toe': {
          target: t.toeMock,
          changeOrigin: true,
          timeout: 30000,
        },
        '/toe-dhan': {
          target: t.toeDhan,
          changeOrigin: true,
          timeout: 30000,
        },
        '/ws': {
          target: httpToWs(t.backend),
          ws: true,
          timeout: 30000,
        },
      },
    },
  };
});
