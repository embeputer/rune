import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@rune/shared", "@rune/runtimes"],
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  reactStrictMode: true,
};

export default nextConfig;
