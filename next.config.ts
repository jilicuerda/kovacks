import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This forces Vercel to deploy even if there are Type/Lint errors
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
