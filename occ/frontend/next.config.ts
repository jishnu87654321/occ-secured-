import type { NextConfig } from "next";
import path from "path";

const isVercelBuild = process.env.VERCEL === "1";

const nextConfig: NextConfig = {
  turbopack: {},
  poweredByHeader: false,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };
    return config;
  },
  // Vercel already packages Next.js apps, so forcing standalone there can
  // break manifest lookup in this nested repo layout.
  ...(isVercelBuild
    ? {}
    : {
        output: "standalone" as const,
        outputFileTracingRoot: path.join(__dirname, ".."),
      }),
};

export default nextConfig;
