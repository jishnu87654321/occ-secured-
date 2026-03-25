import type { NextConfig } from "next";
import path from "path";

const isVercelBuild = process.env.VERCEL === "1";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  outputFileTracingRoot: path.join(__dirname, ".."),
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
      }),
};

export default nextConfig;
