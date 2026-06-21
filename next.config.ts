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
  images: {
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }],
  },
};

export default nextConfig;
