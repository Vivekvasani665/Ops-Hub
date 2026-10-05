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
        '/api': { target: apiTarget, changeOrigin: true },
        '/socket.io': { target: apiTarget, ws: true, changeOrigin: true },
      },
    },
    preview: {
      allowedHosts: ['.trycloudflare.com'],
    },
  };
});
