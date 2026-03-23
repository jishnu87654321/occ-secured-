import type { CorsOptions } from "cors";
import { env } from "./env";

const allowedOrigins = env.corsOrigin
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

function isOriginAllowed(origin: string) {
  if (allowedOrigins.includes(origin)) {
    return true;
  }

  const isOffCampusClubDomain = /^https:\/\/([a-z0-9-]+\.)?offcampusclub\.com$/i.test(origin);
  if (isOffCampusClubDomain && allowedOrigins.some((value) => /offcampusclub\.com$/i.test(value))) {
    return true;
  }

  // P3 FIX: Restrict Vercel previews to this project's deployments only (not all *.vercel.app)
  const isVercelPreview = /^https:\/\/frontend-[a-z0-9]+-jishnus-projects[a-z0-9-]*\.vercel\.app$/i.test(origin);
  if (isVercelPreview && allowedOrigins.some((value) => value.endsWith(".vercel.app"))) {
    return true;
  }

  return false;
}

export const corsOptions: CorsOptions = {
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }

    if (isOriginAllowed(origin)) {
      callback(null, true);
      return;
    }
    callback(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204
};
