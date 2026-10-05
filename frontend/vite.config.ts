import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig(({ mode }) => {
  // The browser always calls same-origin /api and /socket.io; in dev Vite proxies them to the backend.
  // Set API_URL in .env (or the shell) when the backend isn't on http://localhost:4000.
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.API_URL || `http://localhost:${env.API_PORT || 4000}`;

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      port: Number(env.WEB_PORT) || 5173,
      strictPort: true, // backend WEB_ORIGIN only allows 5173; fail loudly instead of drifting to 5174
      // Allow Cloudflare quick tunnels (the subdomain changes on every `cloudflared tunnel` run).
      allowedHosts: ['.trycloudflare.com'],
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          // The backend's CSRF guard only trusts origins in WEB_ORIGIN. A request that is genuinely
          // same-origin with this dev server (e.g. via a Cloudflare tunnel URL) is rewritten to the
          // local dev origin; real cross-origin requests keep their Origin and are still rejected.
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq, req) => {
              const origin = req.headers.origin;
              const host = req.headers['x-forwarded-host'] ?? req.headers.host;
              if (origin && host && new URL(origin).host === host) {
                proxyReq.setHeader('origin', `http://localhost:${Number(env.WEB_PORT) || 5173}`);
              }
            });
          },
        },
        '/socket.io': { target: apiTarget, ws: true, changeOrigin: true },
      },
    },
    preview: {
      allowedHosts: ['.trycloudflare.com'],
    },
  };
});
