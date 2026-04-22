import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    // Pin the workspace root so Next.js doesn't pick up a stray parent lockfile.
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
