import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@rune/shared", "@rune/runtimes"],
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  // Pin Turbopack's project root to the monorepo root so it doesn't latch
  // onto a stray ~/package-lock.json above the workspace.
  turbopack: {
    root: path.resolve(import.meta.dirname, "../.."),
  },
  reactStrictMode: true,
};

export default nextConfig;
