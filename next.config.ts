import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The home directory contains a stray package-lock.json; pin the workspace
  // root to this project so Turbopack/Next resolves files correctly.
  turbopack: {
    root: __dirname,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // Every server function used to carry about 65 MB of Prisma files for databases we do not use
  // (CockroachDB, MySQL, SQL Server, SQLite) and the browser/edge builds. We run PostgreSQL through
  // the native engine, so none of these are ever loaded. Leaving them out keeps each deployment small
  // (Vercel counts the size of every deployment we keep).
  outputFileTracingExcludes: {
    "*": [
      "node_modules/@prisma/client/runtime/*.wasm*",
      "node_modules/.prisma/client/*.wasm*",
    ],
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }],
  },
  poweredByHeader: false,
  // Security headers on every page: no other site may show WorshipHQ inside a frame (so nobody can
  // trick a signed-in admin into clicking hidden buttons), browsers don't guess file types, and full
  // page addresses aren't leaked to other sites.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
        ],
      },
    ];
  },
  experimental: {
    staleTimes: {
      dynamic: 300,
      static: 300,
    },
  },
};

export default nextConfig;
