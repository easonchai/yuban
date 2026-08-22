import type { NextConfig } from "next";

const API = process.env.API_ORIGIN ?? "http://localhost:8400";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${API}/api/:path*` },
      { source: "/auth/:token", destination: `${API}/auth/:token` },
    ];
  },
};

export default nextConfig;
