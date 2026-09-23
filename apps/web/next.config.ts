import type { NextConfig } from "next";

const rawBase = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:3001";
const base = new URL(rawBase);
if (!(["http:", "https:"].includes(base.protocol) && base.pathname === "/" && !base.search && !base.hash)) {
  throw new Error("API_INTERNAL_URL must be an HTTP origin without a path");
}

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: "/api/v1/:path*", destination: `${base.origin}/api/v1/:path*` }];
  },
};

export default nextConfig;
