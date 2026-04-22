import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Produce a self-contained server bundle for minimal Docker images.
  output: "standalone",
  turbopack: {
    // Pin the workspace root so Next.js doesn't pick up a stray parent lockfile.
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
