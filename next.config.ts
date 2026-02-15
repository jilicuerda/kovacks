import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true, // Keep this one, it is still valid
  },
};

export default nextConfig;
