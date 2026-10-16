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
  experimental: {
    staleTimes: {
      dynamic: 300,
      static: 300,
    },
  },
};

export default nextConfig;
