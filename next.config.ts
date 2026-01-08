import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/originai',
        destination: '/originai/index.html',
      },
    ];
  },
};

export default nextConfig;
