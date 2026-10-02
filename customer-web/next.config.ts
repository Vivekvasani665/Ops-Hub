import type { NextConfig } from 'next';

// The browser only ever calls same-origin /api/storefront/*; Next forwards it to the existing OpsHub backend.
// Session cookies therefore stay first-party, exactly like the admin app's Vite proxy.
// Only the storefront API is exposed — the staff API (/api/orders, /api/users, …) is not proxied.
const apiUrl = process.env.API_URL || 'http://localhost:4500';

const nextConfig: NextConfig = {
  // This app is self-contained inside the monorepo; don't let Next pick up lockfiles further up.
  turbopack: { root: __dirname },
  agentRules: false,
  reactStrictMode: true,
  poweredByHeader: false,
  async rewrites() {
    return [{ source: '/api/storefront/:path*', destination: `${apiUrl}/api/storefront/:path*` }];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
