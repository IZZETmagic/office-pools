import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.sportpool.io" }],
        destination: "https://sportpool.io/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
